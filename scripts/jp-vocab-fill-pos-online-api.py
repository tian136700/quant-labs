#!/usr/bin/env python3
"""临时：线上补日语单词缺词性（tokken Anthropic → fill-pos）。

每轮 1 条；付费间隔与 jp-vocab-fill-online 共用门禁（防并行烧钱）。
队列空 → exit 10，由 stage.sh 卸掉临时 launchd。

用法：
  python3 scripts/jp-vocab-fill-pos-online-api.py
  python3 scripts/jp-vocab-fill-pos-online-api.py --dry-run
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

API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-pos"
HTTP_USER_AGENT = "jp-vocab-fill-pos-online/1.0"
# 与统一线上补全共用，避免双任务同时打付费
RATE_GATE_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-online.last_paid_call"
)
POISON_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-pos-online.poison.json"
)
STATUS_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-pos-online.status.json"
)
DONE_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-pos-online-DONE.switch"
)
MAINTENANCE_WORD_RUN_URL = "http://127.0.0.1:17823/api/jp-vocab-fill/word-runs"

DEFAULT_MIN_INTERVAL_SEC = 60
DEFAULT_POISON_SEC = 6 * 3600
LIST_CANDIDATE_LIMIT = 20
EXIT_QUEUE_EMPTY = 10

SYSTEM = (
    "你为日语 N5/N4 初学者标注词性。"
    "只输出一行中文词性正文。"
    "允许的词性（只能从中选）：名词、动词、い形容词、な形容词、副词、助词、"
    "接続词、感叹词、数词、连体词、代词、接尾词、接头词、连语、专有名词。"
    "多词性用斜杠 / 连接，例如：名词/副词。"
    "问候语/寒暄套话用「感叹词」或「连语」，不要自造「寒暄语」。"
    "国名用「专有名词」。不要释义、不要例句、不要编号、不要 markdown。"
)

MARKDOWN_RE = re.compile(r"[`*_#\[\]|>]")
FENCE_RE = re.compile(r"^```(?:\w+)?\s*|\s*```$", re.MULTILINE)
LEADING_LABEL_RE = re.compile(r"^(词性|pos)\s*[:：]\s*", re.I)

ALLOWED_POS = {
    "名词",
    "动词",
    "い形容词",
    "な形容词",
    "形容词",
    "副词",
    "助词",
    "接続词",
    "接续词",
    "感叹词",
    "数词",
    "连体词",
    "代词",
    "接尾词",
    "接头词",
    "连语",
    "固有名詞",
    "专有名词",
}
POS_ALIASES = {
    "名詞": "名词",
    "動詞": "动词",
    "形容詞": "形容词",
    "い形": "い形容词",
    "ナ形": "な形容词",
    "な形": "な形容词",
    "副詞": "副词",
    "助詞": "助词",
    "接続詞": "接続词",
    "感嘆詞": "感叹词",
    "数詞": "数词",
    "連体詞": "连体词",
    "代名詞": "代词",
    "寒暄语": "感叹词",
    "寒暄": "感叹词",
    "问候语": "感叹词",
    "挨拶": "感叹词",
    "语气词": "感叹词",
    "感叹": "感叹词",
    "国名": "专有名词",
    "地名": "专有名词",
    "固有名词": "专有名词",
}


def now_local_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def write_status(payload: dict[str, Any]) -> None:
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {**payload, "updated_at": now_local_str()}
    STATUS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def report_word_run(payload: dict[str, Any]) -> None:
    try:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            MAINTENANCE_WORD_RUN_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        pass


def resolve_min_interval_sec() -> int:
    raw = (
        os.environ.get("JP_VOCAB_FILL_POS_ONLINE_MIN_INTERVAL_SEC", "").strip()
        or os.environ.get("JP_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", "").strip()
    )
    try:
        return max(30, int(raw)) if raw else DEFAULT_MIN_INTERVAL_SEC
    except ValueError:
        return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = os.environ.get("JP_VOCAB_FILL_POS_ONLINE_POISON_SEC", "").strip()
    try:
        return max(600, int(raw)) if raw else DEFAULT_POISON_SEC
    except ValueError:
        return DEFAULT_POISON_SEC


def load_poison() -> dict[str, dict]:
    if not POISON_PATH.is_file():
        return {}
    try:
        data = json.loads(POISON_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    now = time.time()
    out: dict[str, dict] = {}
    for key, val in data.items():
        if not isinstance(val, dict):
            continue
        try:
            until = float(val.get("until") or 0)
        except (TypeError, ValueError):
            continue
        if until > now:
            out[str(key)] = val
    return out


def mark_poison(word_id: int, word: str, reason: str) -> None:
    data = load_poison()
    data[str(word_id)] = {
        "word": word,
        "reason": reason,
        "until": time.time() + resolve_poison_sec(),
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
            f"[jp-vocab-fill-pos-online] rate-gate: 距上次付费 {elapsed:.0f}s "
            f"< {min_sec}s，等待 {wait}s…",
            flush=True,
        )
        time.sleep(wait)


def mark_paid_call() -> None:
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    RATE_GATE_PATH.write_text(f"{time.time():.3f}\n", encoding="utf-8")


def map_pos_token(raw: str) -> str | None:
    t = raw.strip().replace("。", "").replace("．", "").replace(".", "")
    if not t:
        return None
    if t in POS_ALIASES:
        t = POS_ALIASES[t]
    if t not in ALLOWED_POS:
        return None
    if t == "接续词":
        return "接続词"
    if t == "形容词":
        return "い形容词"
    if t == "固有名詞":
        return "专有名词"
    return t


def normalize_pos_text(raw: str) -> str:
    text = FENCE_RE.sub("", str(raw or "")).strip()
    text = LEADING_LABEL_RE.sub("", text)
    text = text.splitlines()[0].strip() if text else ""
    text = text.replace("／", "/").replace("，", "/").replace(",", "/")
    parts: list[str] = []
    seen: set[str] = set()
    for chunk in re.split(r"[/／|,，;；]+", text):
        mapped = map_pos_token(chunk)
        if not mapped or mapped in seen:
            continue
        seen.add(mapped)
        parts.append(mapped)
        if len(parts) >= 3:
            break
    return "/".join(parts)


def generate_pos(prompt: str) -> str:
    raw = call_anthropic(
        prompt,
        system=SYSTEM,
        max_tokens=64,
        temperature=0.1,
        timeout=180,
    )
    return normalize_pos_text(raw)


def mark_done_switch() -> None:
    DONE_PATH.parent.mkdir(parents=True, exist_ok=True)
    DONE_PATH.write_text(
        f"done_at={now_local_str()}\nreason=queue_empty\n",
        encoding="utf-8",
    )


def run_once(*, dry_run: bool, allow_burst: bool) -> int:
    assert_not_killed("jp-pos-online")
    if skip_if_worker_unavailable(API_URL, label="jp-vocab-fill-pos-online"):
        write_status({"phase": "skip", "reason": "worker_unavailable"})
        return 0

    token = resolve_token()
    if not token:
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")

    print(
        f"{now_local_str()} jp-vocab-fill-pos-online: start "
        f"backend=online model={build_online_source_label()}",
        flush=True,
    )

    scan = call_api(
        API_URL,
        token,
        {"mode": "list_missing", "limit": LIST_CANDIDATE_LIMIT},
        user_agent=HTTP_USER_AGENT,
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    missing = list(scan.get("missing") or [])
    total_missing = int(scan.get("total_missing") or 0)
    if total_missing <= 0 or not missing:
        print(
            f"[jp-vocab-fill-pos-online] QUEUE_EMPTY_DONE total_missing={total_missing}",
            flush=True,
        )
        write_status({"phase": "done", "remaining": 0})
        mark_done_switch()
        print(f"{now_local_str()} jp-vocab-fill-pos-online: done", flush=True)
        return EXIT_QUEUE_EMPTY

    poison = load_poison()
    row = None
    for cand in missing:
        wid = str(int(cand["id"]))
        if wid in poison:
            print(
                f"[jp-vocab-fill-pos-online] skip poisoned id={wid} "
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
            f"[jp-vocab-fill-pos-online] 本批候选均在毒丸冷却；"
            f"remaining≈{total_missing}，下轮再试",
            flush=True,
        )
        print(f"{now_local_str()} jp-vocab-fill-pos-online: done", flush=True)
        return 0

    wid = int(row["id"])
    word = str(row.get("word") or "")
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        raise SystemExit(f"missing prompt for id={wid}")

    print(
        f"  [1/1] id={wid} kind=word word={word!r} needs=['pos'] "
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
            "preview": "pos-online",
        }
    )

    wait_paid_rate_gate(allow_burst=allow_burst)
    mark_paid_call()
    source = build_online_source_label()
    try:
        pos = generate_pos(prompt)
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
            scope="jp-pos-online",
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
        print(f"{now_local_str()} jp-vocab-fill-pos-online: done", flush=True)
        return 1

    if not pos or MARKDOWN_RE.search(pos):
        print(f"    fail generate: empty_or_bad pos={pos!r}", flush=True)
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "word",
                "status": "failed",
                "error": "empty_pos",
                "finished_at": now_local_str(),
            }
        )
        mark_poison(wid, word, "empty_pos")
        after_attempt(
            scope="jp-pos-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail="empty_pos",
        )
        print(f"{now_local_str()} jp-vocab-fill-pos-online: done", flush=True)
        return 1

    print(f"    got={{'pos': {pos!r}}}", flush=True)
    if dry_run:
        print(f"    dry-run skip apply source={source}", flush=True)
        print(f"{now_local_str()} jp-vocab-fill-pos-online: done", flush=True)
        return 0

    apply = call_api(
        API_URL,
        token,
        {
            "mode": "apply",
            "source": source,
            "updates": [{"word_id": wid, "pos": pos}],
        },
        user_agent=HTTP_USER_AGENT,
    )
    updated = int(apply.get("updated") or 0)
    applied = apply.get("applied") or []
    skipped = apply.get("skipped") or []
    ok = updated > 0 and bool(applied)
    print(f"    applied=['pos'] source={source} updated={updated}", flush=True)
    if skipped:
        print(f"    skipped={skipped}", flush=True)

    report_word_run(
        {
            "word_id": wid,
            "word": word,
            "kind": "word",
            "status": "success" if ok else "failed",
            "source": source,
            "applied": "['pos']" if ok else "[]",
            "preview": pos,
            "error": "" if ok else "apply_none",
            "finished_at": now_local_str(),
        }
    )
    if ok:
        after_attempt(
            scope="jp-pos-online",
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
                "pos": pos,
                "remaining": remaining_after,
            }
        )
    else:
        reason = "apply_none"
        if skipped:
            reason = str(skipped[0].get("reason") or reason)
        mark_poison(wid, word, reason)
        after_attempt(
            scope="jp-pos-online",
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
        f"{now_local_str()} jp-vocab-fill-pos-online: done "
        f"remaining≈{max(0, total_missing - (1 if ok else 0))}",
        flush=True,
    )
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="临时线上补日语缺词性")
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
