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
CHAT = PARENT / "lib" / "bots" / "schedule_chat_command.py"


def _fail(msg: str) -> int:
    print(f"FAIL: {msg}")
    return 1


def main() -> int:
    for path in (SYNC_PY, SYNC_SH, KICK_SH, PLIST, SETUP, RULE):
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

    if CHAT.is_file():
        chat = CHAT.read_text(encoding="utf-8")
        if "def kick_schedule_caldav_sync" not in chat:
            return _fail("schedule_chat_command.py missing kick_schedule_caldav_sync")
        if "已触发同步到手机日历" not in chat:
            return _fail("success text should mention phone sync")
    if BOT.is_file():
        bot = BOT.read_text(encoding="utf-8")
        if "kick_schedule_caldav_sync" not in bot:
            return _fail("telegram_bot.py must call kick_schedule_caldav_sync after ingest")

    print("OK: schedule CalDAV→iPhone sync guards present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
