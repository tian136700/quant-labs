#!/usr/bin/env python3
"""词表补全：队列空时降频，避免每分钟 list_missing 空转打 D1。

连续一轮「无待补」→ 本 owner 10 分钟内不再打 Worker（含 quiz gate 之前的 shell 跳过）。
有待补并成功进队 → 立刻清 backoff，恢复 60s 探活。

环境变量：
  VOCAB_FILL_EMPTY_BACKOFF_SEC（默认 600）
  FORCE / JP_VOCAB_FILL_FORCE / EN_VOCAB_FILL_FORCE=1 → 跳过 backoff
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

CONFIG_DIR = Path.home() / ".config" / "info-quests"
STATE_FILE = CONFIG_DIR / "vocab-fill-empty-backoff.json"
DEFAULT_BACKOFF_SEC = 600


def _backoff_sec() -> int:
    raw = os.environ.get("VOCAB_FILL_EMPTY_BACKOFF_SEC", "").strip()
    if raw.isdigit() and int(raw) > 0:
        return int(raw)
    return DEFAULT_BACKOFF_SEC


def _force_bypass() -> bool:
    for key in (
        "FORCE",
        "JP_VOCAB_FILL_FORCE",
        "EN_VOCAB_FILL_FORCE",
        "VOCAB_FILL_EMPTY_BACKOFF_FORCE",
    ):
        if os.environ.get(key, "").strip() in ("1", "true", "yes"):
            return True
    return False


def _load() -> dict[str, Any]:
    if not STATE_FILE.is_file():
        return {}
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save(data: dict[str, Any]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def should_skip_owner(owner: str) -> tuple[bool, str]:
    if _force_bypass():
        return False, "force bypass"
    entry = _load().get(owner)
    if not isinstance(entry, dict):
        return False, "no state"
    until = int(entry.get("backoff_until") or 0)
    now = int(time.time())
    if until > now:
        remain = until - now
        return True, f"empty queue backoff {remain}s remaining (until {time.strftime('%F %T', time.localtime(until))})"
    return False, "backoff expired"


def record_empty(owner: str) -> None:
    data = _load()
    now = int(time.time())
    sec = _backoff_sec()
    data[owner] = {
        "backoff_until": now + sec,
        "last_empty_at": now,
        "backoff_sec": sec,
    }
    _save(data)


def record_nonempty(owner: str) -> None:
    data = _load()
    if owner in data:
        del data[owner]
        _save(data)


def cmd_check(owner: str) -> int:
    skip, detail = should_skip_owner(owner)
    if skip:
        print(detail, flush=True)
        return 0
    return 1


def cmd_record_empty(owner: str) -> int:
    record_empty(owner)
    sec = _backoff_sec()
    print(f"recorded empty → backoff {sec}s", flush=True)
    return 0


def cmd_record_nonempty(owner: str) -> int:
    record_nonempty(owner)
    print("recorded nonempty → backoff cleared", flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="vocab fill empty-queue backoff")
    parser.add_argument("command", choices=["check", "record-empty", "record-nonempty"])
    parser.add_argument("--owner", required=True)
    args = parser.parse_args()

    if args.command == "check":
        return cmd_check(args.owner)
    if args.command == "record-empty":
        return cmd_record_empty(args.owner)
    return cmd_record_nonempty(args.owner)


if __name__ == "__main__":
    raise SystemExit(main())
