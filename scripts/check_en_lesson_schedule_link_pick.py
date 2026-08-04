#!/usr/bin/env python3
"""回归：日程关联英语教材用迷你英语新课弹窗（未完成/上课中）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIB = ROOT / "src/lib/en-lesson-schedule-link-pick.ts"
MODAL = ROOT / "src/components/en-lesson-page/EnLessonScheduleLinkPickModal.tsx"
LINK = ROOT / "src/components/JpLessonManualScheduleLinkFromDetailModal.tsx"
PICKER = ROOT / "src/components/JpLessonManualScheduleLessonPicker.tsx"
CHECK_LINKED = ROOT / "scripts/check_manual_schedule_linked_lessons.py"


def main() -> int:
    errors: list[str] = []

    for path in (LIB, MODAL, LINK, PICKER):
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")

    lib = LIB.read_text(encoding="utf-8") if LIB.is_file() else ""
    for needle in (
        "isEnLessonLinkableForSchedule",
        "filterEnLessonsForScheduleLink",
        "filterEnLessonsByLinkPickStatus",
        "enLessonToManualScheduleOption",
        'getEnLessonProgressStatus(lesson) !== "completed"',
    ):
        if needle not in lib:
            errors.append(f"en-lesson-schedule-link-pick.ts must contain {needle}")

    modal = MODAL.read_text(encoding="utf-8") if MODAL.is_file() else ""
    for needle in (
        "EnLessonScheduleLinkPickModal",
        "未完成",
        "上课中",
        "EnLessonContentPreview",
        "选择",
        "jp-lesson-page--en",
    ):
        if needle not in modal:
            errors.append(f"EnLessonScheduleLinkPickModal must contain {needle}")
    if "上课完" in modal and 'status === "completed"' in modal:
        # status label helper may mention 上课完 but tabs must not include completed
        pass
    if 'status: "completed"' in modal or "上课完" in modal and "PICK_STATUS_TABS" in modal:
        # ensure tabs don't include completed
        if '"completed"' in modal.split("PICK_STATUS_TABS")[1].split("];")[0]:
            errors.append("pick tabs must not include completed")

    link = LINK.read_text(encoding="utf-8") if LINK.is_file() else ""
    if "EnLessonScheduleLinkPickModal" not in link:
        errors.append("LinkFromDetail must use EnLessonScheduleLinkPickModal for English")
    if 'titleSubject === "en"' not in link:
        errors.append("LinkFromDetail must branch on English title subject")

    picker = PICKER.read_text(encoding="utf-8") if PICKER.is_file() else ""
    if "EnLessonScheduleLinkPickModal" not in picker:
        errors.append("LessonPicker must open EnLessonScheduleLinkPickModal for English")
    if "filterEnLessonsForScheduleLink" not in picker:
        errors.append("LessonPicker must filter out completed English lessons")

    if errors:
        for err in errors:
            print(f"FAIL: {err}", file=sys.stderr)
        return 1
    print("OK: en-lesson schedule link pick modal")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
