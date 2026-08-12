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

    # 短句：日程，日语，李老师，11:30 → 今天 11:30，默认 30 分钟
    t6 = "日程，日语，李老师，11:30"
    if looks_like_schedule_query(t6):
        fail("short create must not be schedule_query")
    if not looks_like_schedule_chat(t6):
        fail("short create should look like schedule_chat")
    p6 = parse_schedule_chat_text(t6, now=now)
    if not isinstance(p6, ScheduleChatDraft):
        fail(f"parse6 failed: {p6}")
    if (
        p6.class_at != "2026-07-26 11:30:00"
        or p6.title != "日语"
        or p6.teacher != "李"
        or p6.duration_minutes != 30
    ):
        fail(f"p6={p6!r}")

    # 时段可写在时间后面；未写日期仍是今天
    t6b = "日语，李老师，11:30，早上"
    p6b = parse_schedule_chat_text(t6b, now=now)
    if not isinstance(p6b, ScheduleChatDraft):
        fail(f"parse6b failed: {p6b}")
    if p6b.class_at != "2026-07-26 11:30:00" or p6b.duration_minutes != 30:
        fail(f"p6b={p6b!r}")

    # 明天 + 30min
    t7 = "明天，日语，李老师，11:30，30min"
    p7 = parse_schedule_chat_text(t7, now=now)
    if not isinstance(p7, ScheduleChatDraft):
        fail(f"parse7 failed: {p7}")
    if (
        p7.class_at != "2026-07-27 11:30:00"
        or p7.title != "日语"
        or p7.teacher != "李"
        or p7.duration_minutes != 30
    ):
        fail(f"p7={p7!r}")

    # 特定日期写在前面 + 40MM
    t8 = "8月13日，英语，星老师，16:00，40MM"
    if not looks_like_schedule_chat(t8):
        fail("dated short create should look like schedule_chat")
    p8 = parse_schedule_chat_text(t8, now=now)
    if not isinstance(p8, ScheduleChatDraft):
        fail(f"parse8 failed: {p8}")
    if (
        p8.class_at != "2026-08-13 16:00:00"
        or p8.title != "英语"
        or p8.teacher != "星"
        or p8.duration_minutes != 40
    ):
        fail(f"p8={p8!r}")

    # —— 查询日程表 ——
    q1 = "请给我最近一段时间的日程表"
    if not looks_like_schedule_query(q1):
        fail("looks_like_schedule_query recent")
    if looks_like_schedule_chat(q1):
        fail("query must not look like ingest")
    rng = parse_schedule_query_range(q1, now=now)
    if rng.start != date(2026, 7, 26) or rng.end != date(2026, 8, 1):
        fail(f"recent range={rng!r}")

    if not looks_like_schedule_query("日程"):
        fail("bare 日程 should query")
    rng_bare = parse_schedule_query_range("日程", now=now)
    if rng_bare.label != "日程管理":
        fail(f"bare 日程 label={rng_bare.label!r}")

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

    # 接线：telegram_bot 必须分发日程意图；实现可在 replies_schedule
    bot_src = (LIB / "bots" / "telegram_bot.py").read_text(encoding="utf-8")
    replies_src = (LIB / "bots" / "telegram_replies_schedule.py").read_text(
        encoding="utf-8"
    )
    for needle in (
        "from bots.telegram_replies_schedule import",
        "_reply_schedule_chat",
        "_reply_schedule_chat_ingest",
        "_reply_schedule_query",
        "schedule_query",
        "schedule_help",
        "schedule_create_help_text",
    ):
        if needle not in bot_src:
            fail(f"telegram_bot.py missing {needle!r}")
    if 'intent="schedule_teacher"' not in replies_src and "schedule_teacher" not in bot_src:
        fail("schedule_teacher pick wiring missing")
    for needle in (
        "def _reply_schedule_chat(",
        "def _reply_schedule_chat_ingest(",
        "def _reply_schedule_query(",
        "format_schedule_already_exists_text",
        "parse_schedule_chat_text",
        'intent="schedule_teacher"',
    ):
        if needle not in replies_src:
            fail(f"telegram_replies_schedule.py missing {needle!r}")

    print("OK: schedule chat parse")


if __name__ == "__main__":
    main()
