#!/usr/bin/env python3
"""临时：单用法语法例句补到 3 条（tokken → fill-usage）。

仅处理「恰好 1 种用法 + 例句 < 3」；多用法不动；变形/对比课不进队。
保留已有用法与接序，只写回 example_sentences。
每轮 1 条；队列空 → exit 10，由 stage.sh 卸临时 launchd。

用法：
  python3 scripts/jp-vocab-fill-single-usage-examples-online-api.py
  python3 scripts/jp-vocab-fill-single-usage-examples-online-api.py --max-rounds 2
  python3 scripts/jp-vocab-fill-single-usage-examples-online-api.py --dry-run
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
    poison_seconds_for_generate_error,
)
from vocab_fill_circuit_breaker import after_attempt, assert_not_killed  # noqa: E402
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402

API_URL = "https://finance.info-quests.com/api/jp-vocab/fill-usage"
HTTP_USER_AGENT = "jp-vocab-fill-single-usage-examples-online/1.0"
RATE_GATE_PATH = (
    Path.home() / ".config" / "info-quests" / "jp-vocab-fill-online.last_paid_call"
)
POISON_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "jp-vocab-fill-single-usage-examples-online.poison.json"
)
STATUS_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "jp-vocab-fill-single-usage-examples-online.status.json"
)
DONE_PATH = (
    Path.home()
    / ".config"
    / "info-quests"
    / "jp-vocab-fill-single-usage-examples-online-DONE.switch"
)
MAINTENANCE_WORD_RUN_URL = "http://127.0.0.1:17823/api/jp-vocab-fill/word-runs"

DEFAULT_MIN_INTERVAL_SEC = 60
DEFAULT_POISON_SEC = 6 * 3600
LIST_CANDIDATE_LIMIT = 20
EXIT_QUEUE_EMPTY = 10
FILL_TASK_ID = "jp-vocab-fill-single-usage-examples-online"

FENCE_RE = re.compile(r"^```(?:\w+)?\s*|\s*```$", re.MULTILINE)
NUMBERED_LINE_RE = re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$")
GLOSS_RE = re.compile(r"^(?:译文|譯文|訳文)\s*[：:]")

SYSTEM = (
    "你为日语 N5～N4 初学者补语法例句。"
    "该语法只有 1 种用法：输出恰好 3 条例句，覆盖接序里不同词类/形态；"
    "接续不足 3 种则换场景。禁止改写用法与接序；禁止输出用法编号与【接序】。"
    "每条：日语（汉字旁半角假名括号）+ 下一行「译文：」自然中文。"
    "禁止行首序号、禁止～占位、禁止句末语法说明括号、禁止「訳文：」。"
)


def now_local_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def resolve_min_interval_sec() -> int:
    raw = os.environ.get("JP_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC", "").strip()
    if raw.isdigit():
        return max(30, int(raw))
    return DEFAULT_MIN_INTERVAL_SEC


def resolve_poison_sec() -> int:
    raw = os.environ.get(
        "JP_VOCAB_FILL_SINGLE_USAGE_EXAMPLES_POISON_SEC", ""
    ).strip()
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
            f"[single-usage-examples] rate-gate: 距上次付费 {elapsed:.0f}s "
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
                f"[single-usage-examples] skip poisoned id={wid} "
                f"word={row.get('word')!r}",
                flush=True,
            )
            continue
        return row
    return None


def parse_three_examples(raw: str) -> str | None:
    text = FENCE_RE.sub("", str(raw or "")).strip()
    lines = [ln.strip() for ln in text.replace("\r\n", "\n").splitlines() if ln.strip()]
    if not lines:
        return None
    out: list[str] = []
    i = 0
    while i < len(lines):
        jp = lines[i]
        m = NUMBERED_LINE_RE.match(jp)
        if m:
            jp = m.group(2).strip()
        i += 1
        if i >= len(lines):
            return None
        gloss = lines[i]
        if not GLOSS_RE.match(gloss):
            return None
        gloss = GLOSS_RE.sub("译文：", gloss, count=1)
        if not gloss.startswith("译文："):
            gloss = "译文：" + gloss
        out.extend([jp, gloss])
        i += 1
    # 恰好 3 条 = 6 行
    if len(out) != 6:
        return None
    return "\n".join(out)


def generate_examples(prompt: str) -> str:
    raw = call_anthropic(
        prompt,
        system=SYSTEM,
        max_tokens=900,
        temperature=0.2,
        timeout=180,
    )
    parsed = parse_three_examples(raw)
    if not parsed:
        raise ValueError("ai_examples_not_three_pairs")
    return parsed


def run_one(
    *,
    dry_run: bool,
    allow_burst: bool,
    token: str,
) -> str:
    scan = call_api(
        API_URL,
        token,
        {
            "mode": "list_missing_single_usage_examples",
            "limit": LIST_CANDIDATE_LIMIT,
        },
        user_agent=HTTP_USER_AGENT,
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    if str(scan.get("mode") or "") != "list_missing_single_usage_examples":
        write_status(
            {
                "phase": "skip",
                "reason": "api_mode_unsupported",
                "got_mode": scan.get("mode"),
            }
        )
        print(
            f"[single-usage-examples] API 未支持 list_missing_single_usage_examples "
            f"（got mode={scan.get('mode')!r}）；部署后再跑",
            flush=True,
        )
        return "skip"

    missing = list(scan.get("missing") or [])
    total_raw = scan.get("total_missing")
    total = int(total_raw) if total_raw is not None else len(missing)
    if total <= 0 or not missing:
        mark_done_switch()
        write_status({"phase": "done", "reason": "queue_empty", "total_missing": 0})
        print(
            "[single-usage-examples] QUEUE_EMPTY_DONE total_missing=0",
            flush=True,
        )
        return "empty"

    row = pick_candidate(missing)
    if row is None:
        write_status({"phase": "skip", "reason": "all_poisoned", "total_missing": total})
        print("[single-usage-examples] 本批候选均在毒丸冷却", flush=True)
        return "skip"

    wid = int(row["id"])
    word = str(row.get("word") or "")
    usage = str(row.get("usage") or "").strip()
    connection = str(row.get("connection") or "").strip() or None
    prompt = str(row.get("prompt") or "").strip()
    ex_count = int(row.get("example_count") or 0)
    print(
        f"  [1/1] id={wid} word={word!r} example_count={ex_count} "
        f"total_missing={total}",
        flush=True,
    )
    write_status(
        {
            "phase": "running",
            "word_id": wid,
            "word": word,
            "example_count": ex_count,
            "total_missing": total,
        }
    )
    report_word_run(
        {
            "word_id": wid,
            "word": word,
            "kind": "grammar",
            "status": "running",
            "preview": "single-usage-examples-top-up",
        }
    )

    if not usage:
        mark_poison(wid, word, "missing_usage")
        after_attempt(
            scope="jp-single-usage-examples",
            word_id=wid,
            word=word,
            fixed=False,
            detail="missing_usage",
        )
        return "fail"

    if dry_run:
        print(f"  dry-run: would top-up examples for id={wid}", flush=True)
        return "ok"

    wait_rate_gate(allow_burst=allow_burst)
    try:
        examples = generate_examples(prompt)
    except Exception as exc:
        reason = f"generate:{exc}"
        mark_poison(
            wid,
            word,
            reason,
            sec=poison_seconds_for_generate_error(str(exc)),
        )
        after_attempt(
            scope="jp-single-usage-examples",
            word_id=wid,
            word=word,
            fixed=False,
            detail=reason,
        )
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "grammar",
                "status": "failed",
                "error": reason,
            }
        )
        print(f"  generate 失败: {exc}", flush=True)
        return "fail"

    preview = examples[:120].replace("\n", " / ")
    apply = call_api(
        API_URL,
        token,
        {
            "mode": "apply",
            "source": build_online_source_label(),
            "updates": [
                {
                    "word_id": wid,
                    "usage": usage,
                    "example_sentences": examples,
                    "connection": connection,
                }
            ],
        },
        user_agent=HTTP_USER_AGENT,
    )
    if not apply.get("ok"):
        reason = f"apply_http:{apply.get('error', apply)}"
        mark_poison(wid, word, reason)
        after_attempt(
            scope="jp-single-usage-examples",
            word_id=wid,
            word=word,
            fixed=False,
            detail=reason,
        )
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "grammar",
                "status": "failed",
                "error": reason,
            }
        )
        return "fail"

    updated = int(apply.get("updated") or 0)
    skipped = apply.get("skipped") or []
    if updated <= 0:
        reason = f"apply_skipped:{skipped}"
        mark_poison(wid, word, reason)
        after_attempt(
            scope="jp-single-usage-examples",
            word_id=wid,
            word=word,
            fixed=False,
            detail=reason,
        )
        report_word_run(
            {
                "word_id": wid,
                "word": word,
                "kind": "grammar",
                "status": "failed",
                "error": reason,
            }
        )
        print(f"  apply 未写入: skipped={skipped}", flush=True)
        return "fail"

    after_attempt(
        scope="jp-single-usage-examples",
        word_id=wid,
        word=word,
        fixed=True,
        detail="applied",
    )
    report_word_run(
        {
            "word_id": wid,
            "word": word,
            "kind": "grammar",
            "status": "success",
            "preview": preview,
            "applied_keys": "['example_sentences']",
        }
    )
    write_status(
        {
            "phase": "success",
            "word_id": wid,
            "word": word,
            "preview": preview,
            "total_missing": max(0, total - 1),
        }
    )
    print(
        f"apply updated={updated} id={wid} word={word!r} preview={preview!r}",
        flush=True,
    )
    return "ok"


def main() -> int:
    parser = argparse.ArgumentParser(description="临时：单用法语法补到 3 条例句")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-rounds", type=int, default=1)
    parser.add_argument("--allow-burst", action="store_true")
    args = parser.parse_args()

    assert_not_killed("jp-single-usage-examples")
    if skip_if_worker_unavailable(
        API_URL, label="jp-vocab-fill-single-usage-examples-online"
    ):
        write_status({"phase": "skip", "reason": "worker_unavailable"})
        return 0

    token = resolve_token()
    if not token:
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")

    max_rounds = max(1, int(args.max_rounds or 1))
    print(
        f"{now_local_str()} jp-vocab-fill-single-usage-examples-online: start "
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
            print(
                f"{now_local_str()} jp-vocab-fill-single-usage-examples-online: done",
                flush=True,
            )
            return EXIT_QUEUE_EMPTY
        if result == "ok":
            ok_count += 1
            continue
        if result == "skip":
            print(
                f"{now_local_str()} jp-vocab-fill-single-usage-examples-online: done",
                flush=True,
            )
            return 0
        break

    print(
        f"{now_local_str()} jp-vocab-fill-single-usage-examples-online: "
        f"done ok={ok_count}",
        flush=True,
    )
    return 0 if ok_count > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
