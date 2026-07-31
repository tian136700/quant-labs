#!/usr/bin/env python3
"""Regression: CalDAV/ICS must merge same-slot word+grammar into one event."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/lib/schedule-caldav-events.ts"


def main() -> int:
    text = SRC.read_text(encoding="utf-8")
    required = [
        "formatScheduleKindLabel",
        "buildScheduleCalDavSlotMergeKey",
        "buildScheduleCalDavSlotUid",
        "mergeRawLessonSlotEvents",
        "单词和语法",
    ]
    missing = [name for name in required if name not in text]
    if missing:
        print("missing in schedule-caldav-events.ts:", ", ".join(missing))
        return 1

    # Must not push one VEVENT per lesson id without slot merge
    if "jp-lesson-${event.lessonId}-${event.scheduleId}" in text:
        print("old per-lesson CalDAV UID still present; use slot UID after merge")
        return 1
    if "en-lesson-${event.lessonId}-${event.scheduleId}" in text:
        print("old per-lesson CalDAV UID still present; use slot UID after merge")
        return 1

    if not re.search(r"mergeRawLessonSlotEvents\s*\(", text):
        print("listScheduleCalDavEvents must call mergeRawLessonSlotEvents")
        return 1

    if "manualScheduleHasLinkedLessonOnSameSlot" not in text:
        print(
            "listScheduleCalDavEvents must skip manuals covered by linked lesson same slot"
        )
        return 1

    if "hasWord && hasGrammar" not in text:
        print("formatScheduleKindLabel missing word+grammar branch")
        return 1

    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
