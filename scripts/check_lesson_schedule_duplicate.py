#!/usr/bin/env python3
"""Regression: lesson schedule form duplicate detection."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORM = ROOT / "src/lib/lesson-class-schedule-form.ts"


def main() -> int:
    text = FORM.read_text(encoding="utf-8")
    required = [
        "LESSON_SCHEDULE_DUPLICATE_MESSAGE",
        "findDuplicateLessonScheduleRowKeys",
        "hasDuplicateClassScheduleInputs",
        "schedule_duplicate",
    ]
    missing = [name for name in required if name not in text]
    if missing:
        print("missing in lesson-class-schedule-form.ts:", ", ".join(missing))
        return 1

    for path in (
        ROOT / "src/lib/en-lesson-class-schedule-db.ts",
        ROOT / "src/lib/jp-lesson-class-schedule-db.ts",
    ):
        body = path.read_text(encoding="utf-8")
        if "schedule_duplicate" not in body:
            print(f"missing schedule_duplicate guard in {path.name}")
            return 1

    en_modal = (ROOT / "src/components/EnLessonNextClassEditModal.tsx").read_text(
        encoding="utf-8"
    )
    if "jp-lesson-next-class-body" not in en_modal:
        print("EnLessonNextClassEditModal missing scroll body wrapper")
        return 1
    if not re.search(r"duplicateRowKeys\.size\s*>\s*0", en_modal):
        print("EnLessonNextClassEditModal save not disabled on duplicates")
        return 1

    mobile = (ROOT / "src/app/mobile/mobile-modals.css").read_text(
        encoding="utf-8"
    )
    if ".jp-lesson-next-class-body" not in mobile:
        print("mobile-modals.css missing .jp-lesson-next-class-body scroll rules")
        return 1

    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
