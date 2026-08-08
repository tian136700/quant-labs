#!/usr/bin/env python3
"""临时：线上补日语缺相关构词（tokken Anthropic → fill-example-sentences）。

覆盖单汉字（口→入口）与多字拆分助记（会社員→会社/店員）。
每轮 1 条；付费间隔与 jp-vocab-fill-online 共用门禁（防并行烧钱）。
队列空 → exit 10，由 stage.sh 卸掉临时 launchd。

用法：
  python3 scripts/jp-vocab-fill-related-compounds-online-api.py
  python3 scripts/jp-vocab-fill-related-compounds-online-api.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from jp_vocab_fill_common import call_api, resolve_token  # noqa: E402
from paid_anthropic_client import (  # noqa: E402
    build_online_source_label,
    call_anthropic,
)
from vocab_fill_circuit_breaker import after_attempt, assert_not_killed  # noqa: E402
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402

API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-example-sentences"
HTTP_USER_AGENT = "jp-vocab-fill-related-compounds-online/1.0"
RATE_GATE_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-online.last_paid_call"
)
POISON_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "jp-vocab-fill-related-compounds-online.poison.json"
)
STATUS_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "jp-vocab-fill-related-compounds-online.status.json"
)
DONE_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "jp-vocab-fill-related-compounds-online-DONE.switch"
)
MAINTENANCE_WORD_RUN_URL = "http://127.0.0.1:17823/api/jp-vocab-fill/word-runs"

DEFAULT_MIN_INTERVAL_SEC = 60
DEFAULT_POISON_SEC = 6 * 3600
LIST_CANDIDATE_LIMIT = 20
EXIT_QUEUE_EMPTY = 10
FILL_TASK_ID = "jp-vocab-fill-related-compounds-online"

SYSTEM = (
    "你为日语 N5/N4 初学者写「相关构词」（助记用）。"
    "只输出相关构词正文：每行 漢字(かな)：简短中文｜词性。"
    "【词性·必填】行末全角「｜」接词性（名词/动词/他动词/自动词/い形容词/な形容词/副词…）。"
    "例：迎え(むかえ)：迎接｜名词；出迎える(でむかえる)：出去迎接｜他动词。"
    "【单汉字】须含本词汉字，且构词里本字读音与本词读音一致（允许连浊：くち→ぐち、こと→ごと）；"
    "禁止不同音读（事=こと 时不要写 食事/大事 等读「じ」的词）。"
    "【多字词】必须拆开汉字，原则上每个汉字各配 1 个学生已学过的 N5～N4 基础常用词；"
    "候选不得包含完整原词，禁止把原词加前后缀变成新词组。"
    "例 自然 → 自分(じぶん)：自己｜名词；全然(ぜんぜん)：完全，根本｜副词。"
    "❌自然界／自然科学：只是扩展「自然」，不能帮助学生拆字记忆。"
    "逐字词允许同位置首字清浊变化（自：し→じ）；其它读音须与本词对应字一致。"
    "较长词可拆自然部件：会社員 → 会社(かいしゃ)：公司｜名词；店員(てんいん)：店员｜名词。"
    "【禁止本词】不要把词条本身再写进相关构词（研修生≠再写研修生）。"
    "一词多义用中文逗号「，」连接（例：目上(めうえ)：上级，长辈｜名词）；释义里不要用分号「；」。"
    "没有自然相关词则输出空。"
    "禁止编号、禁止 markdown、禁止解释段落。"
)

FENCE_RE = re.compile(r"^```(?:\w+)?\s*|\s*```$", re.MULTILINE)
LINE_RE = re.compile(
    r"^([\u4E00-\u9FFF々〆ヶぁ-んァ-ンー]+)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]\s*[:：]\s*(.+)$"
)


def now_local_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def resolve_min_interval_sec() -> int:
    raw = os.environ.get("JP_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", "").strip()
    if raw.isdigit():
        return max(30, int(raw))
    return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = os.environ.get("JP_VOCAB_FILL_RC_ONLINE_POISON_SEC", "").strip()
    if raw.isdigit():
        return max(60, int(raw))
    return DEFAULT_POISON_SEC


def write_status(payload: dict[str, Any]) -> None:
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = dict(payload)
    data["updated_at"] = now_local_str()
    STATUS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def report_word_run(payload: dict[str, Any]) -> None:
    body_obj = dict(payload)
    if not str(body_obj.get("fill_task") or "").strip():
        body_obj["fill_task"] = FILL_TASK_ID
    try:
        req = urllib.request.Request(
            MAINTENANCE_WORD_RUN_URL,
            data=json.dumps(body_obj, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            resp.read()
    except Exception:
        pass


def load_poison() -> dict[str, dict[str, Any]]:
    if not POISON_PATH.is_file():
        return {}
    try:
        raw = json.loads(POISON_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    now = time.time()
    out: dict[str, dict[str, Any]] = {}
    for wid, meta in raw.items():
        if not isinstance(meta, dict):
            continue
        try:
            until = float(meta.get("until") or 0)
        except (TypeError, ValueError):
            continue
        if until > now:
            out[str(wid)] = meta
    return out


def mark_poison(word_id: int, word: str, reason: str) -> None:
    data = load_poison()
    data[str(int(word_id))] = {
        "word": word,
        "reason": reason[:200],
        "until": time.time() + resolve_poison_sec(),
        "at": now_local_str(),
    }
    POISON_PATH.parent.mkdir(parents=True, exist_ok=True)
    POISON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"    poison id={word_id} for {resolve_poison_sec()}s (reason={reason})",
        flush=True,
    )


def wait_paid_rate_gate(*, allow_burst: bool) -> None:
    if allow_burst:
        return
    min_sec = resolve_min_interval_sec()
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    while True:
        now = time.time()
        last = 0.0
        if RATE_GATE_PATH.is_file():
            try:
                last = float(RATE_GATE_PATH.read_text(encoding="utf-8").strip() or "0")
            except (OSError, ValueError):
                last = 0.0
        elapsed = now - last
        if elapsed >= min_sec:
            return
        wait = max(1, int(min_sec - elapsed) + 1)
        print(
            f"[jp-vocab-fill-related-compounds-online] rate-gate: 距上次付费 {elapsed:.0f}s "
            f"< {min_sec}s，等待 {wait}s…",
            flush=True,
        )
        time.sleep(wait)


def mark_paid_call() -> None:
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(f"{time.time():.3f}\n", encoding="utf-8")


def normalize_related_compounds_text(raw: str) -> str:
    """保留「｜词性」；半角 | 规范成全角｜。"""
    text = FENCE_RE.sub("", str(raw or "")).strip()
    if not text:
        return ""
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # 去掉行首编号
        line = re.sub(r"^[\d]+[\.\)、．]\s*", "", line)
        m = LINE_RE.match(line)
        if not m:
            continue
        surface, reading, gloss = m.group(1), m.group(2), m.group(3).strip()
        if not surface or not reading or not gloss:
            continue
        # 词性分隔：半角 | → 全角｜（勿把释义里的竖线吃掉成逗号）
        if "|" in gloss and "｜" not in gloss:
            gloss = gloss.replace("|", "｜", 1)
        lines.append(f"{surface}({reading})：{gloss}")
        if len(lines) >= 5:
            break
    return "\n".join(lines)


def generate_related_compounds(prompt: str) -> str:
    raw = call_anthropic(
        prompt,
        system=SYSTEM,
        max_tokens=384,
        temperature=0.2,
        timeout=180,
    )
    return normalize_related_compounds_text(raw)


def mark_done_switch() -> None:
    DONE_PATH.parent.mkdir(parents=True, exist_ok=True)
    DONE_PATH.write_text(
        f"done_at={now_local_str()}\nreason=queue_empty\n",
        encoding="utf-8",
    )


def run_once(*, dry_run: bool, allow_burst: bool) -> int:
    assert_not_killed("jp-related-compounds-online")
    if skip_if_worker_unavailable(API_URL, label="jp-vocab-fill-related-compounds-online"):
        write_status({"phase": "skip", "reason": "worker_unavailable"})
        return 0

    token = resolve_token()
    if not token:
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")

    print(
        f"{now_local_str()} jp-vocab-fill-related-compounds-online: start "
        f"backend=online model={build_online_source_label()}",
        flush=True,
    )

    scan = call_api(
        API_URL,
        token,
        {
            "mode": "list_missing_related_compounds",
            "limit": LIST_CANDIDATE_LIMIT,
            "single_kanji_only": False,
        },
        user_agent=HTTP_USER_AGENT,
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    # 旧 Worker 不认识本 mode 时会落到 list_missing（缺例句），勿误判队列空并卸 launchd
    if str(scan.get("mode") or "") != "list_missing_related_compounds":
        write_status(
            {
                "phase": "skip",
                "reason": "api_mode_unsupported",
                "got_mode": scan.get("mode"),
            }
        )
        print(
            f"[jp-vocab-fill-related-compounds-online] API 未支持 "
            f"list_missing_related_compounds（got mode={scan.get('mode')!r}）；"
            f"等部署后再跑，勿标 DONE",
            flush=True,
        )
        print(f"{now_local_str()} jp-vocab-fill-related-compounds-online: done", flush=True)
        return 0

    missing = list(scan.get("missing") or [])
    total_missing = int(scan.get("total_missing") or 0)
    if total_missing <= 0 or not missing:
        print(
            f"[jp-vocab-fill-related-compounds-online] QUEUE_EMPTY_DONE "
            f"total_missing={total_missing}",
            flush=True,
        )
        write_status({"phase": "done", "remaining": 0})
        mark_done_switch()
        print(f"{now_local_str()} jp-vocab-fill-related-compounds-online: done", flush=True)
        return EXIT_QUEUE_EMPTY

    poison = load_poison()
    row = None
    for cand in missing:
        wid = str(int(cand["id"]))
        if wid in poison:
            print(
                f"[jp-vocab-fill-related-compounds-online] skip poisoned id={wid} "
                f"reason={poison[wid].get('reason')!r}",
                flush=True,
            )
            continue
        row = cand
        break

    if row is None:
        write_status(
            {
                "phase": "idle",
                "remaining": total_missing,
                "reason": "all_poisoned_in_batch",
            }
        )
        print(
            f"[jp-vocab-fill-related-compounds-online] 本批候选均在毒丸冷却；"
            f"remaining≈{total_missing}，下轮再试",
            flush=True,
        )
        print(f"{now_local_str()} jp-vocab-fill-related-compounds-online: done", flush=True)
        return 0

    wid = int(row["id"])
    word = str(row.get("word") or "")
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        raise SystemExit(f"missing prompt for id={wid}")

    print(
        f"  [1/1] id={wid} kind=word word={word!r} needs=['related_compounds'] "
        f"remaining≈{total_missing}",
        flush=True,
    )
    write_status(
        {
            "phase": "running",
            "word_id": wid,
            "word": word,
            "remaining": total_missing,
        }
    )
    report_word_run(
        {
            "word_id": wid,
            "word": word,
            "kind": "word",
            "status": "running",
            "started_at": now_local_str(),
            "preview": "related-compounds-online",
        }
    )

    wait_paid_rate_gate(allow_burst=allow_burst)
    mark_paid_call()
    source = build_online_source_label()
    try:
        related = generate_related_compounds(prompt)
    except Exception as err:
        print(f"    fail generate: {err}", flush=True)
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "word",
                "status": "failed",
                "error": f"generate:{err}",
                "finished_at": now_local_str(),
            }
        )
        mark_poison(wid, word, f"generate:{err}")
        after_attempt(
            scope="jp-related-compounds-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=f"generate:{err}",
        )
        write_status(
            {
                "phase": "failed",
                "word_id": wid,
                "word": word,
                "remaining": total_missing,
                "error": str(err)[:200],
            }
        )
        print(f"{now_local_str()} jp-vocab-fill-related-compounds-online: done", flush=True)
        return 1

    print(f"    got={{'related_compounds': {related!r}}}", flush=True)
    if dry_run:
        print(f"    dry-run skip apply source={source}", flush=True)
        print(f"{now_local_str()} jp-vocab-fill-related-compounds-online: done", flush=True)
        return 0

    if related:
        update_body: dict[str, Any] = {
            "word_id": wid,
            "related_compounds": related,
        }
        applied_keys = "['related_compounds']"
        preview = related.splitlines()[0] if related else ""
    else:
        update_body = {
            "word_id": wid,
            "mark_related_compounds_checked": True,
        }
        applied_keys = "['related_compounds']"
        preview = "(无自然相关构词)"

    apply = call_api(
        API_URL,
        token,
        {
            "mode": "apply",
            "source": source,
            "updates": [update_body],
        },
        user_agent=HTTP_USER_AGENT,
    )
    updated = int(apply.get("updated") or 0)
    applied = apply.get("applied") or []
    skipped = apply.get("skipped") or []
    ok = updated > 0 and bool(applied)
    print(f"    applied={applied_keys} source={source} updated={updated}", flush=True)
    if skipped:
        print(f"    skipped={skipped}", flush=True)

    report_word_run(
        {
            "word_id": wid,
            "word": word,
            "kind": "word",
            "status": "success" if ok else "failed",
            "source": source,
            "applied": applied_keys if ok else "[]",
            "preview": preview,
            "error": "" if ok else "apply_none",
            "finished_at": now_local_str(),
        }
    )
    if ok:
        verify = call_api(
            API_URL,
            token,
            {
                "mode": "list_missing_related_compounds",
                "limit": LIST_CANDIDATE_LIMIT,
                "single_kanji_only": False,
            },
            user_agent=HTTP_USER_AGENT,
        )
        still = any(
            int(r.get("id") or 0) == wid for r in (verify.get("missing") or [])
        )
        if still:
            print(
                f"    apply_ok_but_still_missing id={wid} word={word!r}",
                flush=True,
            )
            mark_poison(wid, word, "apply_ok_but_still_missing")
            after_attempt(
                scope="jp-related-compounds-online",
                word_id=wid,
                word=word,
                fixed=False,
                detail="apply_ok_but_still_missing",
            )
            write_status(
                {
                    "phase": "failed",
                    "word_id": wid,
                    "word": word,
                    "remaining": total_missing,
                    "error": "apply_ok_but_still_missing",
                }
            )
            print(
                f"{now_local_str()} jp-vocab-fill-related-compounds-online: done",
                flush=True,
            )
            return 1
        after_attempt(
            scope="jp-related-compounds-online",
            word_id=wid,
            word=word,
            fixed=True,
            detail="applied",
        )
        remaining_after = max(0, total_missing - 1)
        write_status(
            {
                "phase": "success",
                "word_id": wid,
                "word": word,
                "related_compounds": related or preview,
                "remaining": remaining_after,
            }
        )
    else:
        reason = "apply_none"
        if skipped:
            reason = str(skipped[0].get("reason") or reason)
        mark_poison(wid, word, reason)
        after_attempt(
            scope="jp-related-compounds-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=reason,
        )
        write_status(
            {
                "phase": "failed",
                "word_id": wid,
                "word": word,
                "remaining": total_missing,
                "error": reason,
            }
        )

    print(
        f"{now_local_str()} jp-vocab-fill-related-compounds-online: done "
        f"remaining≈{max(0, total_missing - (1 if ok else 0))}",
        flush=True,
    )
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="临时线上补日语单汉字相关构词")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--allow-burst",
        action="store_true",
        help="跳过付费间隔（仅人工调试）",
    )
    args = parser.parse_args()
    return run_once(dry_run=args.dry_run, allow_burst=args.allow_burst)


if __name__ == "__main__":
    raise SystemExit(main())
