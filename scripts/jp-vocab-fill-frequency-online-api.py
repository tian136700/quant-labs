#!/usr/bin/env python3
"""临时：线上补日语词条「口语/考试」出现频率（tokken → fill-frequency）。

单词：词级 oral_frequency / exam_frequency（1～10）
语法：每种用法旁 [口语n|考试m]（展示 口语 n/10 · 考试 m/10）

每轮 1 条；队列空 → exit 10，由 stage.sh 卸掉临时 launchd。

用法：
  python3 scripts/jp-vocab-fill-frequency-online-api.py
  python3 scripts/jp-vocab-fill-frequency-online-api.py --max-rounds 2
  python3 scripts/jp-vocab-fill-frequency-online-api.py --dry-run
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
from jp_vocab_frequency import extract_jp_vocab_frequencies  # noqa: E402
from paid_anthropic_client import (  # noqa: E402
    build_online_source_label,
    call_anthropic,
    poison_seconds_for_generate_error,
)
from vocab_fill_circuit_breaker import after_attempt, assert_not_killed  # noqa: E402
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402

API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-frequency"
EXAMPLES_API_URL = (
    "https://finance.info-quests.com/api/jp-vocab/fill-example-sentences"
)
HTTP_USER_AGENT = "jp-vocab-fill-frequency-online/1.0"
RATE_GATE_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-online.last_paid_call"
)
POISON_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "jp-vocab-fill-frequency-online.poison.json"
)
STATUS_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "jp-vocab-fill-frequency-online.status.json"
)
DONE_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "jp-vocab-fill-frequency-online-DONE.switch"
)
MAINTENANCE_WORD_RUN_URL = "http://127.0.0.1:17823/api/jp-vocab-fill/word-runs"

DEFAULT_MIN_INTERVAL_SEC = 60
DEFAULT_POISON_SEC = 6 * 3600
LIST_CANDIDATE_LIMIT = 20
EXIT_QUEUE_EMPTY = 10
FILL_TASK_ID = "jp-vocab-fill-frequency-online"

WORD_SYSTEM = (
    "你为日语 N5/N4 初学者评估单词出现频率。"
    "必须先输出【出现频率】块，两行："
    "口语频率：n"
    "考试频率：m"
    "n/m 为 1～10 整数；禁止写成 n/10、附单位、JSON。"
    "口语=日常会话；考试=JLPT。可打不同分。"
    "若用户要求相关构词：在频率块后另起【相关构词】，每行 漢字(かな)：中文；"
    "多字词先拆部件再举同旁词（会社員→会社/店員）；没有则留空。"
    "禁止把构词写进频率行；禁止 markdown/解释段落。"
)

GRAMMAR_SYSTEM = (
    "你为日语语法补「口语/考试」出现分。"
    "只输出编号用法行：数字. [口语n|考试m] 原文说明。(Nn)"
    "保留原中文说明与句末等级，禁止改写含义、禁止例句、禁止 markdown。"
)

USAGE_FREQ_RE = re.compile(
    r"\[\s*口语\s*[：:]?\s*(\d{1,2})\s*[|｜]\s*考试\s*[：:]?\s*(\d{1,2})\s*\]"
)
RELATED_BLOCK_RE = re.compile(
    r"【相关构词】\s*\n(.*?)(?=\n【|\Z)",
    re.DOTALL,
)
RELATED_LINE_RE = re.compile(
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
    raw = os.environ.get("JP_VOCAB_FILL_FREQUENCY_POISON_SEC", "").strip()
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
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass


def load_poison() -> dict[str, Any]:
    if not POISON_PATH.is_file():
        return {}
    try:
        return json.loads(POISON_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_poison(data: dict[str, Any]) -> None:
    POISON_PATH.parent.mkdir(parents=True, exist_ok=True)
    POISON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def is_poisoned(wid: int, now: float | None = None) -> bool:
    now = time.time() if now is None else now
    data = load_poison()
    row = data.get(str(wid))
    if not isinstance(row, dict):
        return False
    until = float(row.get("until") or 0)
    return until > now


def mark_poison(wid: int, word: str, reason: str, sec: int | None = None) -> None:
    data = load_poison()
    wait = resolve_poison_sec() if sec is None else max(60, int(sec))
    data[str(wid)] = {
        "word": word,
        "reason": reason,
        "until": time.time() + wait,
        "at": now_local_str(),
    }
    save_poison(data)


def wait_rate_gate(*, allow_burst: bool) -> None:
    if allow_burst:
        return
    min_sec = resolve_min_interval_sec()
    RATE_GATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    last = 0.0
    if RATE_GATE_PATH.is_file():
        try:
            last = float(RATE_GATE_PATH.read_text(encoding="utf-8").strip() or "0")
        except Exception:
            last = 0.0
    elapsed = time.time() - last
    if elapsed < min_sec:
        sleep_for = min_sec - elapsed
        print(
            f"[jp-vocab-fill-frequency-online] rate-gate: 距上次付费 {elapsed:.0f}s "
            f"< {min_sec}s，等待 {sleep_for:.0f}s",
            flush=True,
        )
        time.sleep(sleep_for)
    RATE_GATE_PATH.write_text(f"{time.time():.3f}\n", encoding="utf-8")


def mark_done_switch() -> None:
    DONE_PATH.parent.mkdir(parents=True, exist_ok=True)
    DONE_PATH.write_text(
        f"done_at={now_local_str()}\nreason=queue_empty\n",
        encoding="utf-8",
    )


def pick_candidate(missing: list[dict[str, Any]]) -> dict[str, Any] | None:
    for row in missing:
        wid = int(row.get("id") or 0)
        if wid <= 0:
            continue
        if is_poisoned(wid):
            print(
                f"[jp-vocab-fill-frequency-online] skip poisoned id={wid} "
                f"word={row.get('word')!r}",
                flush=True,
            )
            continue
        return row
    return None


def generate_word_freq(
    prompt: str, *, need_related: bool
) -> tuple[int | None, int | None, str | None]:
    """付费生成词级频率；若 need_related 则同一次解析相关构词。

    返回 (oral, exam, related_text_or_None)。
    related 为 None 表示本轮不写相关构词；"" 表示查过为空须 mark checked。
    """
    last_raw = ""
    for attempt in range(2):
        extra = ""
        if attempt > 0:
            extra = (
                "\n\n上次格式不对。请严格先输出：\n"
                "【出现频率】\n口语频率：8\n考试频率：6\n"
                "数字不要带 /10。"
            )
            if need_related:
                extra += (
                    "\n若需相关构词，再输出：\n【相关构词】\n"
                    "漢字(かな)：中文\n（可空）"
                )
        raw = call_anthropic(
            prompt + extra,
            system=WORD_SYSTEM,
            max_tokens=512 if need_related else 128,
            temperature=0.1 if attempt == 0 else 0.0,
            timeout=180,
        )
        last_raw = str(raw or "")
        _, oral, exam = extract_jp_vocab_frequencies(last_raw)
        if oral is not None and exam is not None:
            related: str | None = None
            if need_related:
                related = extract_related_compounds_block(last_raw)
            return oral, exam, related
        print(
            f"  [freq-parse-retry] attempt={attempt + 1} "
            f"oral={oral} exam={exam} raw={last_raw[:120]!r}",
            flush=True,
        )
    _, oral, exam = extract_jp_vocab_frequencies(last_raw)
    related = extract_related_compounds_block(last_raw) if need_related else None
    return oral, exam, related


def extract_related_compounds_block(raw: str) -> str:
    """从整段输出抽出【相关构词】正文；无块 → ""（视为查过为空）。"""
    text = str(raw or "").replace("\r\n", "\n").strip()
    if not text:
        return ""
    m = RELATED_BLOCK_RE.search(text)
    body = m.group(1) if m else ""
    if not body.strip() and "【相关构词】" not in text:
        # 模型可能直接输出行、无标题：从频率块后扫合法行
        lines_out: list[str] = []
        past_freq = False
        for line in text.split("\n"):
            t = line.strip()
            if t in ("【出现频率】", "【频率】"):
                past_freq = True
                continue
            if past_freq and RELATED_LINE_RE.match(t):
                lines_out.append(t)
        return "\n".join(lines_out).strip()
    lines_out = []
    for line in body.split("\n"):
        t = line.strip()
        if not t:
            continue
        if t.startswith("（") and "中文" in t:
            continue
        if RELATED_LINE_RE.match(t):
            lines_out.append(t)
    return "\n".join(lines_out).strip()


def generate_grammar_usage(prompt: str) -> str:
    raw = call_anthropic(
        prompt,
        system=GRAMMAR_SYSTEM,
        max_tokens=1024,
        temperature=0.1,
        timeout=180,
    )
    text = str(raw or "").strip()
    if "```" in text:
        text = re.sub(r"^```(?:\w+)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
    return text


def run_one(
    *,
    dry_run: bool,
    allow_burst: bool,
    token: str,
) -> str:
    """返回 ok | skip | empty | fail"""
    scan = call_api(
        API_URL,
        token,
        {
            "mode": "list_missing",
            "limit": LIST_CANDIDATE_LIMIT,
            "kind": "any",
        },
        user_agent=HTTP_USER_AGENT,
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    if str(scan.get("mode") or "") != "list_missing":
        write_status(
            {
                "phase": "skip",
                "reason": "api_mode_unsupported",
                "got_mode": scan.get("mode"),
            }
        )
        print(
            f"[jp-vocab-fill-frequency-online] API 未支持 list_missing "
            f"（got mode={scan.get('mode')!r}）；部署后再跑",
            flush=True,
        )
        return "skip"

    missing = list(scan.get("missing") or [])
    total = int(scan.get("total_missing") or 0)
    if total <= 0 or not missing:
        mark_done_switch()
        write_status({"phase": "done", "reason": "queue_empty", "total_missing": 0})
        print(
            f"[jp-vocab-fill-frequency-online] QUEUE_EMPTY_DONE total_missing=0",
            flush=True,
        )
        return "empty"

    row = pick_candidate(missing)
    if row is None:
        write_status({"phase": "skip", "reason": "all_poisoned", "total_missing": total})
        print(
            "[jp-vocab-fill-frequency-online] 本批候选均在毒丸冷却",
            flush=True,
        )
        return "skip"

    wid = int(row["id"])
    word = str(row.get("word") or "")
    kind = str(row.get("kind") or "")
    prompt = str(row.get("prompt") or "")
    need_related = bool(row.get("need_related_compounds")) and kind != "grammar"
    print(
        f"  [1/1] id={wid} kind={kind} word={word!r} "
        f"need_oral={row.get('need_oral_frequency')} "
        f"need_exam={row.get('need_exam_frequency')} "
        f"need_usage={row.get('need_usage_frequency')} "
        f"need_related={need_related} "
        f"total_missing={total}",
        flush=True,
    )
    write_status(
        {
            "phase": "running",
            "word_id": wid,
            "word": word,
            "kind": kind,
            "need_related_compounds": need_related,
            "total_missing": total,
        }
    )
    report_word_run(
        {
            "word_id": wid,
            "word": word,
            "kind": "frequency",
            "status": "running",
            "preview": "frequency-online",
        }
    )

    wait_rate_gate(allow_burst=allow_burst)
    related_text: str | None = None
    try:
        if kind == "grammar":
            usage_ai = generate_grammar_usage(prompt)
            if not USAGE_FREQ_RE.search(usage_ai):
                raise ValueError("grammar_ai_missing_frequency_markers")
            update: dict[str, Any] = {"word_id": wid, "usage": usage_ai}
            preview = usage_ai[:120].replace("\n", " / ")
        else:
            oral, exam, related_text = generate_word_freq(
                prompt, need_related=need_related
            )
            if oral is None or exam is None:
                raise ValueError(f"word_ai_incomplete oral={oral} exam={exam}")
            update = {
                "word_id": wid,
                "oral_frequency": oral,
                "exam_frequency": exam,
            }
            preview = f"口语 {oral}/10 · 考试 {exam}/10"
            if need_related:
                if related_text:
                    preview += f" · 构词 {related_text.splitlines()[0]}"
                else:
                    preview += " · 构词(空)"
    except Exception as exc:
        reason = f"generate:{exc}"
        sec = poison_seconds_for_generate_error(
            str(exc), default_sec=resolve_poison_sec()
        )
        mark_poison(wid, word, reason, sec=sec)
        after_attempt(
            scope="jp-frequency-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=reason,
        )
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "frequency",
                "status": "failed",
                "error": reason,
            }
        )
        write_status({"phase": "failed", "word_id": wid, "word": word, "error": reason})
        print(f"  Anthropic/解析失败: {exc}", flush=True)
        return "fail"

    print(f"    got={preview!r}", flush=True)
    if dry_run:
        print("  dry-run: skip apply", flush=True)
        return "ok"

    source = build_online_source_label()
    apply = call_api(
        API_URL,
        token,
        {
            "mode": "apply",
            "source": source,
            "updates": [update],
        },
        user_agent=HTTP_USER_AGENT,
    )
    if not apply.get("ok"):
        reason = f"apply:{apply.get('error', apply)}"
        mark_poison(wid, word, reason)
        after_attempt(
            scope="jp-frequency-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=reason,
        )
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "frequency",
                "status": "failed",
                "error": reason,
            }
        )
        print(f"  apply 失败: {apply}", flush=True)
        return "fail"

    updated = int(apply.get("updated") or 0)
    skipped = apply.get("skipped") or []
    if updated <= 0:
        reason = f"apply_skipped:{skipped}"
        mark_poison(wid, word, reason)
        after_attempt(
            scope="jp-frequency-online",
            word_id=wid,
            word=word,
            fixed=False,
            detail=reason,
        )
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "frequency",
                "status": "failed",
                "error": reason,
            }
        )
        print(f"  apply 未写入: skipped={skipped}", flush=True)
        return "fail"

    after_attempt(
        scope="jp-frequency-online",
        word_id=wid,
        word=word,
        fixed=True,
        detail="applied",
    )

    related_applied = False
    if need_related and related_text is not None and not dry_run:
        if related_text.strip():
            related_update: dict[str, Any] = {
                "word_id": wid,
                "related_compounds": related_text.strip(),
            }
        else:
            related_update = {
                "word_id": wid,
                "mark_related_compounds_checked": True,
            }
        related_apply = call_api(
            EXAMPLES_API_URL,
            token,
            {
                "mode": "apply",
                "source": source,
                "updates": [related_update],
            },
            user_agent=HTTP_USER_AGENT,
        )
        if related_apply.get("ok") and int(related_apply.get("updated") or 0) > 0:
            related_applied = True
            print(
                f"  related_compounds applied id={wid} "
                f"preview={(related_text.splitlines()[0] if related_text else '(empty)')!r}",
                flush=True,
            )
        else:
            print(
                f"  related_compounds apply skipped/fail: {related_apply}",
                flush=True,
            )

    applied_keys = (
        "['usage']"
        if kind == "grammar"
        else (
            "['oral_frequency','exam_frequency','related_compounds']"
            if related_applied
            else "['oral_frequency','exam_frequency']"
        )
    )
    report_word_run(
        {
            "word_id": wid,
            "word": word,
            "kind": "frequency",
            "status": "success",
            "preview": preview,
            "applied_keys": applied_keys,
        }
    )
    write_status(
        {
            "phase": "success",
            "word_id": wid,
            "word": word,
            "kind": kind,
            "preview": preview,
            "related_applied": related_applied,
            "total_missing": max(0, total - 1),
        }
    )
    print(
        f"apply updated={updated} id={wid} word={word!r} preview={preview!r}",
        flush=True,
    )
    return "ok"


def main() -> int:
    parser = argparse.ArgumentParser(description="临时：日语口语/考试频率补全")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--max-rounds",
        type=int,
        default=1,
        help="本进程最多成功写回几条（默认 1；试跑可用 2）",
    )
    parser.add_argument(
        "--allow-burst",
        action="store_true",
        help="跳过付费间隔（仅调试）",
    )
    args = parser.parse_args()

    assert_not_killed("jp-frequency-online")
    if skip_if_worker_unavailable(API_URL, label="jp-vocab-fill-frequency-online"):
        write_status({"phase": "skip", "reason": "worker_unavailable"})
        return 0

    token = resolve_token()
    if not token:
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")

    max_rounds = max(1, int(args.max_rounds or 1))
    print(
        f"{now_local_str()} jp-vocab-fill-frequency-online: start "
        f"backend=online model={build_online_source_label()} max_rounds={max_rounds}",
        flush=True,
    )

    ok_count = 0
    for round_i in range(max_rounds):
        print(f"--- round {round_i + 1}/{max_rounds} ---", flush=True)
        result = run_one(
            dry_run=bool(args.dry_run),
            allow_burst=bool(args.allow_burst),
            token=token,
        )
        if result == "empty":
            print(f"{now_local_str()} jp-vocab-fill-frequency-online: done", flush=True)
            return EXIT_QUEUE_EMPTY
        if result == "ok":
            ok_count += 1
            continue
        if result == "skip":
            print(f"{now_local_str()} jp-vocab-fill-frequency-online: done", flush=True)
            return 0
        # fail：本轮结束（launchd 下轮再试）
        break

    print(
        f"{now_local_str()} jp-vocab-fill-frequency-online: done ok={ok_count}",
        flush=True,
    )
    return 0 if ok_count > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
