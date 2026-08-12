#!/usr/bin/env python3
"""Regression: CalDAV→iPhone sync must skip unchanged, kick on ingest, Bark on fail."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SYNC_PY = ROOT / "scripts" / "schedule-caldav-sync.py"
SYNC_SH = ROOT / "scripts" / "schedule-caldav-sync.sh"
KICK_SH = ROOT / "scripts" / "schedule-caldav-kick.sh"
PLIST = ROOT / "scripts" / "com.infoquests.schedule-caldav.plist.example"
SETUP = ROOT / "scripts" / "setup-schedule-caldav-mac.sh"
RULE = ROOT / ".cursor" / "rules" / "schedule-caldav-iphone-sync.mdc"
# parent-repo Telegram bot (sibling of strategy-compare-cloud)
PARENT = ROOT.parent
BOT = PARENT / "lib" / "bots" / "telegram_bot.py"
REPLIES_SCHEDULE = PARENT / "lib" / "bots" / "telegram_replies_schedule.py"
CHAT = PARENT / "lib" / "bots" / "schedule_chat_command.py"


def _fail(msg: str) -> int:
    print(f"FAIL: {msg}")
    return 1


EVENTS_TS = ROOT / "src" / "lib" / "schedule-caldav-events.ts"
LOAD_TS = ROOT / "src" / "lib" / "schedule-caldav-events-load.ts"


def main() -> int:
    for path in (SYNC_PY, SYNC_SH, KICK_SH, PLIST, SETUP, RULE, EVENTS_TS, LOAD_TS):
        if not path.is_file():
            return _fail(f"missing {path.relative_to(ROOT)}")

    sync_py = SYNC_PY.read_text(encoding="utf-8")
    for name in (
        "fingerprint_from_event",
        "fingerprint_from_ical",
        "unchanged",
        "--force",
    ):
        if name not in sync_py:
            return _fail(f"schedule-caldav-sync.py missing {name!r}")

    # Must not always delete+put without fingerprint skip
    if "if not force and href is not None and remote_fp" not in sync_py:
        return _fail("sync must skip unchanged events unless --force")

    sync_sh = SYNC_SH.read_text(encoding="utf-8")
    if "notify_caldav_failure" not in sync_sh:
        return _fail("schedule-caldav-sync.sh must Bark on failure")
    if "send_bark_push" not in sync_sh:
        return _fail("schedule-caldav-sync.sh must call send_bark_push")
    if "1027" not in sync_sh:
        return _fail("failure notify must mention Worker 1027")
    if "1102" not in sync_sh:
        return _fail("failure notify must mention Worker 1102")

    kick_sh = KICK_SH.read_text(encoding="utf-8")
    if "schedule-caldav.kick" not in kick_sh:
        return _fail("kick script must touch schedule-caldav.kick")
    if "kickstart" not in kick_sh:
        return _fail("kick script should launchctl kickstart")

    plist = PLIST.read_text(encoding="utf-8")
    if "<integer>1800</integer>" in plist:
        return _fail("plist StartInterval must not be 1800 (use 600)")
    if not re.search(r"<key>StartInterval</key>\s*<integer>600</integer>", plist):
        return _fail("plist StartInterval must be 600")
    if "WatchPaths" not in plist or "schedule-caldav.kick" not in plist:
        return _fail("plist must WatchPaths schedule-caldav.kick")

    setup = SETUP.read_text(encoding="utf-8")
    if "__CONFIG_DIR__" not in setup:
        return _fail("setup must substitute __CONFIG_DIR__ for WatchPaths")
    if "schedule-caldav-kick.sh" not in setup:
        return _fail("setup must chmod kick script")

    rule = RULE.read_text(encoding="utf-8")
    if "alwaysApply: true" not in rule:
        return _fail("schedule-caldav-iphone-sync.mdc must alwaysApply")
    if "kick" not in rule.lower() or "Bark" not in rule:
        return _fail("rule must document kick + Bark")
    if "1102" not in rule or "listJpLessons" not in rule:
        return _fail("rule must forbid full listJpLessons (1102)")

    events_ts = EVENTS_TS.read_text(encoding="utf-8")
    if re.search(r'from ["\']@/lib/(jp|en)-lesson-db["\']', events_ts):
        return _fail("schedule-caldav-events.ts must not import jp/en-lesson-db")
    if re.search(r"\blist(Jp|En)Lessons\s*\(", events_ts):
        return _fail("schedule-caldav-events.ts must not call listJpLessons/listEnLessons")
    if "loadScheduleCalDavBundle" not in events_ts:
        return _fail("schedule-caldav-events.ts must use loadScheduleCalDavBundle")

    load_ts = LOAD_TS.read_text(encoding="utf-8")
    if re.search(r"\b(meanings|example_sentences)\b", load_ts):
        return _fail("schedule-caldav-events-load.ts must not SELECT meanings/example_sentences")
    if re.search(r'from ["\']@/lib/(jp|en)-lesson-db["\']', load_ts):
        return _fail("schedule-caldav-events-load.ts must not import jp/en-lesson-db")
    if re.search(r"\blist(Jp|En)Lessons\s*\(", load_ts):
        return _fail("schedule-caldav-events-load.ts must not call listJpLessons/listEnLessons")
    if "JP_JOINED_SELECT" not in load_ts or "EN_JOINED_SELECT" not in load_ts:
        return _fail("schedule-caldav-events-load.ts must define JP/EN joined schedule selects")
    if "SUBSTR(" not in load_ts:
        return _fail(
            "lite SELECT must SUBSTR(content) in SQL "
            "(not pull full content then truncate in JS)"
        )
    if "resolveScheduleCalDavDateWindow" not in load_ts:
        return _fail("load must resolve a date window (default past/future days)")
    if "SCHEDULE_CALDAV_DEFAULT_FUTURE_DAYS" not in load_ts:
        return _fail("load must define default future window days")
    # 类型在 jp-lesson-manual-schedule.ts，不在 *-db（曾导致 deploy tsc 失败）
    if re.search(
        r'type\s+JpLessonManualSchedule\s*[,\}].*from\s+["\']@/lib/jp-lesson-manual-schedule-db["\']',
        load_ts,
        re.S,
    ) or 'type JpLessonManualSchedule,\n} from "@/lib/jp-lesson-manual-schedule-db"' in load_ts:
        return _fail(
            "JpLessonManualSchedule must be imported from "
            "@/lib/jp-lesson-manual-schedule (not *-db)"
        )
    if 'from "@/lib/jp-lesson-manual-schedule"' not in load_ts and \
       "from '@/lib/jp-lesson-manual-schedule'" not in load_ts:
        return _fail("schedule-caldav-events-load must import JpLessonManualSchedule type")

    route = ROOT / "src" / "app" / "api" / "admin" / "schedule-events" / "route.ts"
    if not route.is_file():
        return _fail("missing schedule-events route")
    route_ts = route.read_text(encoding="utf-8")
    if "searchParams.get(\"from\")" not in route_ts and "searchParams.get('from')" not in route_ts:
        return _fail("schedule-events route must accept from/to query")
    if "lite" not in route_ts:
        return _fail("schedule-events route must accept lite=1")

    if "--fetch-retries" not in sync_py or "--events-file" not in sync_py:
        return _fail(
            "schedule-caldav-sync.py must support --fetch-retries and --events-file"
        )
    if "1102" not in sync_py:
        return _fail("schedule-caldav-sync.py must handle Worker 1102 retries")

    if CHAT.is_file():
        chat = CHAT.read_text(encoding="utf-8")
        if "def kick_schedule_caldav_sync" not in chat:
            return _fail("schedule_chat_command.py missing kick_schedule_caldav_sync")
        if "已触发同步到手机日历" not in chat:
            return _fail("success text should mention phone sync")
        # Telegram 查表必须带日期窗 + lite，并对 1102 重试
        if "lite=True" not in chat:
            return _fail("Telegram schedule query must call fetch_schedule_events(..., lite=True)")
        if "from_date=rng.start" not in chat or "to_date=rng.end" not in chat:
            return _fail(
                "Telegram schedule query must pass from_date/to_date from query range"
            )
        if 'params["lite"]' not in chat and "params['lite']" not in chat:
            return _fail("fetch_schedule_events must put lite=1 on schedule-events URL")
        if "1102" not in chat:
            return _fail("Telegram fetch_schedule_events must retry on Worker 1102")
    kick_wired = False
    if REPLIES_SCHEDULE.is_file() and "kick_schedule_caldav_sync" in REPLIES_SCHEDULE.read_text(
        encoding="utf-8"
    ):
        kick_wired = True
    if BOT.is_file() and "kick_schedule_caldav_sync" in BOT.read_text(encoding="utf-8"):
        kick_wired = True
    if (BOT.is_file() or REPLIES_SCHEDULE.is_file()) and not kick_wired:
        return _fail(
            "telegram schedule ingest must call kick_schedule_caldav_sync "
            "(telegram_replies_schedule.py or telegram_bot.py)"
        )
    print("OK: schedule CalDAV→iPhone sync guards present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
