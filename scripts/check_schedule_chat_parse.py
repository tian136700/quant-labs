#!/usr/bin/env python3
"""Regression: Telegram 日程自然语言解析 / 查询（父项目 schedule_chat_command）。"""

from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # us_stock_monitor
LIB = ROOT / "lib"
if str(LIB) not in sys.path:
    sys.path.insert(0, str(LIB))

from bots.schedule_chat_command import (  # noqa: E402
    ScheduleChatDraft,
    filter_events_in_range,
    format_schedule_list_text,
    looks_like_schedule_chat,
    looks_like_schedule_query,
    parse_schedule_chat_text,
    parse_schedule_query_range,
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
    if looks_like_schedule_query(text):
        fail("ingest sample must not be schedule_query")
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

    # 明确说「系统里面的」→ 去掉前缀，按已有老师名匹配
    t3 = "录入今天下午4点韩语课，一个小时，老师是系统里面的欣欣"
    p3 = parse_schedule_chat_text(t3, now=now)
    if not isinstance(p3, ScheduleChatDraft):
        fail(f"parse3 failed: {p3}")
    if p3.teacher != "欣欣" or p3.title != "韩语" or p3.duration_minutes != 60:
        fail(f"p3={p3!r}")
    if p3.class_at != "2026-07-26 16:00:00":
        fail(f"class_at3={p3.class_at!r}")

    # 「今天下午4点，星老师一个小时日语课」
    t4 = "今天下午4点，星老师一个小时日语课"
    if not looks_like_schedule_chat(t4):
        fail("colloquial create should look like schedule_chat")
    p4 = parse_schedule_chat_text(t4, now=now)
    if not isinstance(p4, ScheduleChatDraft):
        fail(f"parse4 failed: {p4}")
    if p4.class_at != "2026-07-26 16:00:00":
        fail(f"class_at4={p4.class_at!r}")
    if p4.title != "日语" or p4.teacher != "星" or p4.duration_minutes != 60:
        fail(f"p4={p4!r}")

    # 「今天下午4点，一小时，星老师，日语课」逗号分隔口语
    t5 = "今天下午4点，一小时，星老师，日语课"
    if not looks_like_schedule_chat(t5):
        fail("comma-separated create should look like schedule_chat")
    p5 = parse_schedule_chat_text(t5, now=now)
    if not isinstance(p5, ScheduleChatDraft):
        fail(f"parse5 failed: {p5}")
    if (
        p5.class_at != "2026-07-26 16:00:00"
        or p5.title != "日语"
        or p5.teacher != "星"
        or p5.duration_minutes != 60
    ):
        fail(f"p5={p5!r}")

    # —— 查询日程表 ——
    q1 = "请给我最近一段时间的日程表"
    if not looks_like_schedule_query(q1):
        fail("looks_like_schedule_query recent")
    if looks_like_schedule_chat(q1):
        fail("query must not look like ingest")
    rng = parse_schedule_query_range(q1, now=now)
    if rng.start != date(2026, 7, 26) or rng.end != date(2026, 8, 1):
        fail(f"recent range={rng!r}")

    q2 = "请给我今天的日程"
    if not looks_like_schedule_query(q2):
        fail("looks_like_schedule_query today")
    rng2 = parse_schedule_query_range(q2, now=now)
    if rng2.start != rng2.end or rng2.start != date(2026, 7, 26):
        fail(f"today range={rng2!r}")

    help_q = "可以帮我新建今天的日程吗？"
    from bots.schedule_chat_command import looks_like_schedule_create_incomplete

    if not looks_like_schedule_create_incomplete(help_q):
        fail("incomplete create should be detected")
    if looks_like_schedule_query(help_q):
        fail("incomplete create must not be query")

    events = [
        {
            "class_at": "2026-07-26 16:00:00",
            "duration_minutes": 60,
            "summary": "手动 · 机构老师 · 韩语",
        },
        {
            "class_at": "2026-07-28 10:00:00",
            "duration_minutes": 55,
            "summary": "日语课 · 欣欣 · 单词",
        },
    ]
    filtered = filter_events_in_range(events, rng)
    if len(filtered) != 2:
        fail(f"filter count={len(filtered)}")
    # 2026-07-26 周日=本周；27=下周一、28=下周二
    body = format_schedule_list_text(filtered, rng, today=date(2026, 7, 26))
    if "16:00–17:00" not in body or "机构老师" not in body:
        fail(f"format body bad: {body[:200]!r}")
    if "7/27 下周一" not in body:
        fail(f"next-week label missing: {body!r}")
    if "7/26 周日" not in body:
        fail(f"this-week Sunday label missing: {body!r}")
    if "7/28 下周二" not in body:
        fail(f"next Tue label missing: {body!r}")
    if "（无课）" not in body:
        fail("empty days should show 无课")

    # 接线：telegram_bot 必须实现回复函数
    bot_src = (LIB / "bots" / "telegram_bot.py").read_text(encoding="utf-8")
    for needle in (
        "def _reply_schedule_chat(",
        "def _reply_schedule_chat_ingest(",
        "def _reply_schedule_query(",
        'intent="schedule_teacher"',
        "schedule_query",
        "schedule_help",
        "schedule_create_help_text",
        "format_schedule_already_exists_text",
    ):
        if needle not in bot_src:
            fail(f"telegram_bot.py missing {needle!r}")

    print("OK: schedule chat parse")


if __name__ == "__main__":
    main()
