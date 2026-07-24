#!/usr/bin/env python3
"""回归：手动日程标题含「韩语」时新增老师须进韩语分类。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RATE = ROOT / "src/lib/jp-lesson-teacher-rate.ts"
MODAL = ROOT / "src/components/JpLessonManualScheduleModal.tsx"
PAGE = ROOT / "src/components/JpLessonSchedulePage.tsx"
PAGE_DIR = ROOT / "src/components/jp-lesson-schedule-page"


def main() -> int:
    rate = RATE.read_text(encoding="utf-8")
    modal = MODAL.read_text(encoding="utf-8")
    from page_bundle import read_page_bundle

    page = read_page_bundle(PAGE, PAGE_DIR)
    errors: list[str] = []

    if 'text.includes("韩语")' not in rate and "includes(\"韩语\")" not in rate:
        errors.append("detectScheduleTeacherSubjectFromTitle must detect 韩语")
    if 'return "ko"' not in rate:
        errors.append("detectScheduleTeacherSubjectFromTitle must return ko")
    if "subject === \"ko\"" not in rate and "subject === 'ko'" not in rate:
        errors.append("scheduleTeacherPickerListForSubject must handle ko")

    if "onAddKoTeacher" not in modal:
        errors.append("JpLessonManualScheduleModal must accept onAddKoTeacher")
    if "koTeachers" not in modal:
        errors.append("JpLessonManualScheduleModal must accept koTeachers")
    if "老师（可选 · 韩语）" not in modal:
        errors.append("modal label must show 韩语 when title detects ko")
    if not re.search(r'teacherSubject\s*===\s*"ko"\s*\?\s*onAddKoTeacher', modal):
        errors.append("modal must route ko subject to onAddKoTeacher")

    if "addKoLessonTeacher" not in page:
        errors.append("JpLessonSchedulePage must define addKoLessonTeacher")
    if "/api/admin/ko-lesson-teachers" not in page:
        errors.append("schedule page must POST/GET ko-lesson-teachers API")
    if "onAddKoTeacher={addKoLessonTeacher}" not in page:
        errors.append("schedule page must pass onAddKoTeacher to modal")
    if "koTeachers={koTeachers}" not in page:
        errors.append("schedule page must pass koTeachers to modal")

    # 历史总计须含韩语（手动日程标题经 detectScheduleTeacherSubjectFromTitle）
    if "koMinutes" not in page:
        errors.append("schedule historicalDurationTotals must track koMinutes")
    if "jpls-legend-dot--ko" not in page:
        errors.append("schedule duration bar must show Korean legend dot")
    if "韩语" not in page or "historicalDurationTotals.koMinutes" not in page:
        errors.append("schedule duration bar must label 韩语 with koMinutes")
    if "detectScheduleTeacherSubjectFromTitle" not in page:
        errors.append(
            "schedule duration totals must classify manual titles via "
            "detectScheduleTeacherSubjectFromTitle (includes 韩语)"
        )

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("ok: manual schedule teacher subject (ko)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
