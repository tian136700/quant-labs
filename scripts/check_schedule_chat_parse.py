#!/usr/bin/env python3
"""Regression: Telegram 日程自然语言解析（父项目 schedule_chat_command）。"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # us_stock_monitor
LIB = ROOT / "lib"
if str(LIB) not in sys.path:
    sys.path.insert(0, str(LIB))

from bots.schedule_chat_command import (  # noqa: E402
    ScheduleChatDraft,
    looks_like_schedule_chat,
    parse_schedule_chat_text,
)

BEIJING = timezone(timedelta(hours=8))


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not (LIB / "bots" / "schedule_chat_command.py").is_file():
        fail(f"missing {LIB / 'bots' / 'schedule_chat_command.py'}")

    now = datetime(2026, 7, 26, 10, 0, tzinfo=BEIJING)
    text = (
        "请帮我录入今天下午4点的那个韩语课，"
        "持续时间是一个小时。老师是那个机构老师。"
    )
    if not looks_like_schedule_chat(text):
        fail("looks_like_schedule_chat should be True for sample")

    parsed = parse_schedule_chat_text(text, now=now)
    if not isinstance(parsed, ScheduleChatDraft):
        fail(f"parse failed: {parsed}")
    if parsed.class_at != "2026-07-26 16:00:00":
        fail(f"class_at={parsed.class_at!r}")
    if parsed.title != "韩语":
        fail(f"title={parsed.title!r}")
    if parsed.teacher != "机构老师":
        fail(f"teacher={parsed.teacher!r}")
    if parsed.duration_minutes != 60:
        fail(f"duration={parsed.duration_minutes!r}")

    # 下午 + 小时 < 12 → +12；老师尊称「欣欣老师」→ 欣欣
    t2 = "录入明天上午10点日语课 55分钟 老师是欣欣老师"
    p2 = parse_schedule_chat_text(t2, now=now)
    if not isinstance(p2, ScheduleChatDraft):
        fail(f"parse2 failed: {p2}")
    if p2.class_at != "2026-07-27 10:00:00":
        fail(f"class_at2={p2.class_at!r}")
    if p2.title != "日语" or p2.teacher != "欣欣" or p2.duration_minutes != 55:
        fail(f"p2={p2!r}")

    print("OK: schedule chat parse")


if __name__ == "__main__":
    main()
