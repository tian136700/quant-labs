#!/usr/bin/env python3
"""Regression: manual schedule create must dedupe same slot content + lock before await."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    schedule_ts = (ROOT / "src/lib/jp-lesson-manual-schedule.ts").read_text(
        encoding="utf-8"
    )
    for name in (
        "manualScheduleContentDedupeKey",
        "isSameManualScheduleContent",
    ):
        if name not in schedule_ts:
            print(f"missing {name} in jp-lesson-manual-schedule.ts")
            return 1

    db = (ROOT / "src/lib/jp-lesson-manual-schedule-db.ts").read_text(
        encoding="utf-8"
    )
    for name in (
        "findDuplicateJpLessonManualSchedule",
        "findActiveDuplicateManualScheduleRecurringRule",
        "deduped",
    ):
        if name not in db:
            print(f"missing {name} in jp-lesson-manual-schedule-db.ts")
            return 1

    if "findDuplicateJpLessonManualSchedule(db, normalized)" not in db:
        print("insert path must call findDuplicate before INSERT")
        return 1

    recurring = (
        ROOT / "src/lib/jp-lesson-manual-schedule-recurring-db.ts"
    ).read_text(encoding="utf-8")
    if "findActiveDuplicateManualScheduleRecurringRule" not in recurring:
        print("recurring create missing active-rule dedupe")
        return 1
    if "CreateOnceManualScheduleResult" not in recurring:
        print("missing CreateOnceManualScheduleResult (dedupe created_count type)")
        return 1
    # 禁止再写死 created_count: 1，否则 dedupe 返回 0 时 Next 类型检查会炸
    if re.search(
        r"created_count:\s*1\s*;\s*\n\s*deduped\?:",
        recurring,
    ):
        print("once-result must allow created_count number/0, not literal 1")
        return 1

    modal = (
        ROOT / "src/components/JpLessonManualScheduleModal.tsx"
    ).read_text(encoding="utf-8")
    # lock must appear before resolveTeacherForSave await
    lock_pos = modal.find("saveInitiatedRef.current = true")
    await_pos = modal.find("await resolveTeacherForSave()")
    if lock_pos < 0 or await_pos < 0 or lock_pos > await_pos:
        print(
            "JpLessonManualScheduleModal must set saveInitiatedRef before "
            "await resolveTeacherForSave"
        )
        return 1

    actions = (
        ROOT
        / "src/components/jp-lesson-schedule-page/useJpLessonSchedulePageActions.ts"
    ).read_text(encoding="utf-8")
    if "已有相同日程，未重复添加" not in actions:
        print("actions missing deduped status message")
        return 1
    if not re.search(r"prev\.some\(\(item\) => item\.id === saved\.id\)", actions):
        print("actions must skip appending duplicate id after dedupe")
        return 1

    route = (
        ROOT / "src/app/api/jp-lesson/manual-schedules/route.ts"
    ).read_text(encoding="utf-8")
    if "deduped" not in route:
        print("POST manual-schedules must return deduped flag")
        return 1

    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
