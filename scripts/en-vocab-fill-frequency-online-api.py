#!/usr/bin/env python3
"""临时：线上补英语用法「口语/考试」双频率（tokken → fill-usage）。

存量：用法行旧单分 [n] 或缺分 → 回填为 [口语n|考试m]
新词：统一 online-batch 已要求双分；本任务只扫缺口。

每轮 1 条；队列空 → exit 10，由 stage.sh 卸掉临时 launchd。

用法：
  python3 scripts/en-vocab-fill-frequency-online-api.py
  python3 scripts/en-vocab-fill-frequency-online-api.py --max-rounds 2
  python3 scripts/en-vocab-fill-frequency-online-api.py --dry-run
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

from en_vocab_fill_common import call_api, resolve_token  # noqa: E402
from paid_anthropic_client import (  # noqa: E402
    build_online_source_label,
    call_anthropic,
    poison_seconds_for_generate_error,
)
from vocab_fill_circuit_breaker import after_attempt, assert_not_killed  # noqa: E402
from vocab_fill_quiz_gate import skip_if_quiz_gate_quiet  # noqa: E402
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402

API_URL = "https://finance.info-quests.com/api/en-vocab/fill-usage"
RATE_GATE_PATH = (
    Path.home() / ".config" / "info-quests" / "en-vocab-fill-online.last_paid_call"
)
POISON_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "en-vocab-fill-frequency-online.poison.json"
)
STATUS_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "en-vocab-fill-frequency-online.status.json"
)
DONE_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "en-vocab-fill-frequency-online-DONE.switch"
)
MAINTENANCE_WORD_RUN_URL = "http://127.0.0.1:17823/api/en-vocab-fill/word-runs"

DEFAULT_MIN_INTERVAL_SEC = 60
DEFAULT_POISON_SEC = 6 * 3600
LIST_CANDIDATE_LIMIT = 20
EXIT_QUEUE_EMPTY = 10
FILL_TASK_ID = "en-vocab-fill-frequency-online"

SYSTEM = (
    "你为英语学习卡片补「口语频率 / 考试频率」。"
    "只输出编号用法行：数字. [口语n|考试m] 原文中文说明。"
    "口语=日常会话常用度；考试=该分类考试语境常用度（托业职场 / 雅思托福等）；"
    "各 1～10 整数；可打不同分；保留原中文说明与条数顺序。"
    "禁止改写含义、禁止例句、禁止 markdown、禁止考试品牌名写进正文。"
)

DUAL_FREQ_RE = re.compile(
    r"\[\s*口语\s*[：:]?\s*(\d{1,2})\s*[|｜]\s*考试\s*[：:]?\s*(\d{1,2})\s*\]"
)
NUMBERED_RE = re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$")


def now_local_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def resolve_min_interval_sec() -> int:
    raw = os.environ.get("EN_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", "").strip()
    if raw.isdigit():
        return max(30, int(raw))
    return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = os.environ.get("EN_VOCAB_FILL_FREQUENCY_POISON_SEC", "").strip()
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
    row = load_poison().get(str(wid))
    if not isinstance(row, dict):
        return False
    return float(row.get("until") or 0) > now


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
            f"[en-vocab-fill-frequency-online] rate-gate: 距上次付费 {elapsed:.0f}s "
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


def usage_has_complete_dual(text: str) -> bool:
    lines = [ln.strip() for ln in str(text or "").splitlines() if ln.strip()]
    numbered = 0
    for ln in lines:
        m = NUMBERED_RE.match(ln)
        if not m:
            continue
        numbered += 1
        if not DUAL_FREQ_RE.search(m.group(2)):
            return False
    return numbered >= 1


def list_frequency_missing(
    token: str, *, limit: int
) -> tuple[list[dict[str, Any]], int]:
    data = call_api(
        API_URL,
        token,
        {"mode": "list_missing", "limit": max(1, min(50, limit))},
    )
    missing = list(data.get("missing") or [])
    total_raw = data.get("total_missing")
    total = int(total_raw) if total_raw is not None else len(missing)
    # 优先只补「已有用法、缺双分」；空用法留给常规定时整词补
    freq_only = [r for r in missing if r.get("needs_frequency_only")]
    if freq_only:
        return freq_only, total
    return missing, total


def generate_usage(prompt: str) -> str:
    raw = call_anthropic(
        system=SYSTEM,
        user=prompt,
        max_tokens=1200,
        temperature=0.2,
        timeout=180,
    )
    text = str(raw or "").strip()
    if not text:
        raise ValueError("empty_ai")
    if "```" in text:
        text = re.sub(r"```(?:\w+)?", "", text).strip()
    if not usage_has_complete_dual(text):
        # 再试一次：强调双分
        raw2 = call_anthropic(
            system=SYSTEM,
            user=(
                prompt
                + "\n\nCRITICAL: every numbered line MUST start with "
                "[口语n|考试m] (both 1-10). Keep Chinese text unchanged."
            ),
            max_tokens=1200,
            temperature=0.1,
            timeout=180,
        )
        text = str(raw2 or "").strip()
        if "```" in text:
            text = re.sub(r"```(?:\w+)?", "", text).strip()
    if not usage_has_complete_dual(text):
        raise ValueError("ai_missing_dual_frequency")
    return text


def apply_usage(
    token: str,
    *,
    word_id: int,
    usage: str,
    dry_run: bool,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "mode": "apply",
        "force": True,
        "source": build_online_source_label(),
        "dry_run": bool(dry_run),
        "updates": [{"word_id": word_id, "usage": usage}],
    }
    return call_api(API_URL, token, body)


def process_one(
    token: str,
    row: dict[str, Any],
    *,
    total_missing: int,
    dry_run: bool,
    allow_burst: bool,
) -> bool:
    wid = int(row.get("id") or 0)
    word = str(row.get("word") or "")
    prompt = str(row.get("prompt") or "").strip()
    if not wid or not prompt:
        return False
    if is_poisoned(wid):
        print(f"  skip poison id={wid} word={word!r}", flush=True)
        return False

    print(
        f"  [1/1] id={wid} word={word!r} "
        f"needs_frequency_only={bool(row.get('needs_frequency_only'))} "
        f"total_missing={total_missing}",
        flush=True,
    )
    write_status(
        {
            "phase": "running",
            "word_id": wid,
            "word": word,
            "total_missing": total_missing,
        }
    )
    report_word_run(
        {
            "word_id": wid,
            "word": word,
            "kind": "frequency",
            "status": "running",
            "preview": "frequency-online",
            "applied": "['oral_frequency','exam_frequency']",
        }
    )

    wait_rate_gate(allow_burst=allow_burst)
    try:
        usage_ai = generate_usage(prompt)
        preview = usage_ai.splitlines()[0][:120] if usage_ai else ""
    except Exception as exc:
        reason = f"generate:{exc}"
        sec = poison_seconds_for_generate_error(
            str(exc), default_sec=resolve_poison_sec()
        )
        mark_poison(wid, word, reason, sec=sec)
        after_attempt(
            scope="en-frequency-online",
            word_id=wid,
            word=word,
            ok=False,
            reason=reason,
        )
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "frequency",
                "status": "failed",
                "error": reason,
                "applied": "['oral_frequency','exam_frequency']",
            }
        )
        write_status({"phase": "failed", "word_id": wid, "error": reason})
        print(f"    FAIL generate: {exc}", flush=True)
        return False

    if dry_run:
        print(f"    dry-run preview={preview!r}", flush=True)
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "frequency",
                "status": "ok",
                "preview": f"dry-run {preview}",
                "applied": "['oral_frequency','exam_frequency']",
            }
        )
        return True

    try:
        result = apply_usage(token, word_id=wid, usage=usage_ai, dry_run=False)
    except Exception as exc:
        reason = f"apply:{exc}"
        mark_poison(wid, word, reason)
        after_attempt(
            scope="en-frequency-online",
            word_id=wid,
            word=word,
            ok=False,
            reason=reason,
        )
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "frequency",
                "status": "failed",
                "error": reason,
                "applied": "['oral_frequency','exam_frequency']",
            }
        )
        print(f"    FAIL apply: {exc}", flush=True)
        return False

    updated = int(result.get("updated") or 0)
    skipped = result.get("skipped") or []
    if updated < 1:
        reason = f"apply_none skipped={skipped!r}"
        mark_poison(wid, word, reason)
        after_attempt(
            scope="en-frequency-online",
            word_id=wid,
            word=word,
            ok=False,
            reason=reason,
        )
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "frequency",
                "status": "failed",
                "error": reason,
                "preview": preview,
                "applied": "['oral_frequency','exam_frequency']",
            }
        )
        print(f"    FAIL {reason}", flush=True)
        return False

    after_attempt(
        scope="en-frequency-online",
        word_id=wid,
        word=word,
        ok=True,
        reason="ok",
    )
    # 清 poison
    data = load_poison()
    if str(wid) in data:
        data.pop(str(wid), None)
        save_poison(data)

    report_word_run(
        {
            "word_id": wid,
            "word": word,
            "kind": "frequency",
            "status": "ok",
            "preview": preview,
            "applied": "['oral_frequency','exam_frequency']",
        }
    )
    write_status(
        {
            "phase": "ok",
            "word_id": wid,
            "word": word,
            "preview": preview,
        }
    )
    print(f"    OK apply updated={updated} preview={preview!r}", flush=True)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="临时：英语用法口语/考试双频率线上回填"
    )
    parser.add_argument("--max-rounds", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--allow-burst",
        action="store_true",
        help="跳过全机付费间隔（仅调试）",
    )
    args = parser.parse_args()

    assert_not_killed("en-vocab-fill-frequency-online")
    skip_if_quiz_gate_quiet("en-vocab-fill-frequency-online")
    if skip_if_worker_unavailable(API_URL, label="en-vocab-fill-frequency-online"):
        return 0

    if DONE_PATH.is_file() and not args.dry_run:
        print(
            f"[en-vocab-fill-frequency-online] DONE switch exists: {DONE_PATH}",
            flush=True,
        )
        return 0

    token = resolve_token()
    max_rounds = max(1, int(args.max_rounds or 1))
    ok_n = 0

    for round_i in range(max_rounds):
        missing, total = list_frequency_missing(
            token, limit=LIST_CANDIDATE_LIMIT
        )
        # 跳过毒丸
        candidates = [
            r
            for r in missing
            if not is_poisoned(int(r.get("id") or 0))
        ]
        if not candidates:
            print(
                f"[en-vocab-fill-frequency-online] queue empty "
                f"(total_missing={total})",
                flush=True,
            )
            if not args.dry_run:
                mark_done_switch()
            write_status({"phase": "queue_empty", "total_missing": total})
            return EXIT_QUEUE_EMPTY

        row = candidates[0]
        print(
            f"[en-vocab-fill-frequency-online] round {round_i + 1}/{max_rounds} "
            f"candidates={len(candidates)} total_missing={total}",
            flush=True,
        )
        if process_one(
            token,
            row,
            total_missing=total,
            dry_run=args.dry_run,
            allow_burst=args.allow_burst,
        ):
            ok_n += 1

    print(
        f"[en-vocab-fill-frequency-online] finished ok={ok_n}/{max_rounds}",
        flush=True,
    )
    return 0 if ok_n > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
