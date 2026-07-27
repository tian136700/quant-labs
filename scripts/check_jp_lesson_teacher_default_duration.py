#!/usr/bin/env python3
"""Regression: jp-lesson common teachers get known default class durations."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HELPER = ROOT / "src/lib/jp-lesson-teacher-default-duration.ts"
NEXT_CLASS = ROOT / "src/components/JpLessonNextClassEditModal.tsx"
BATCH = ROOT / "src/components/JpLessonBatchScheduleTeacherModal.tsx"
MANUAL = ROOT / "src/components/JpLessonManualScheduleModal.tsx"
MODALS = ROOT / "src/components/jp-lesson-page/JpLessonPageModals.tsx"

REQUIRED_KNOWN = {
    "李老师": 30,
    "秦老师": 45,
    "琴老师": 45,
    "玉老师": 60,
    "星老师": 60,
}


def main() -> int:
    errors: list[str] = []

    helper = HELPER.read_text(encoding="utf-8")
    if "JP_LESSON_TEACHER_KNOWN_DEFAULT_DURATION_MINUTES" not in helper:
        errors.append(f"{HELPER.relative_to(ROOT)}: missing known defaults map")
    if "resolveJpLessonDefaultDurationFromTeachers" not in helper:
        errors.append(
            f"{HELPER.relative_to(ROOT)}: missing resolveJpLessonDefaultDurationFromTeachers"
        )
    for name, minutes in REQUIRED_KNOWN.items():
        pattern = rf"{re.escape(name)}\s*:\s*{minutes}\b"
        if not re.search(pattern, helper):
            errors.append(
                f"{HELPER.relative_to(ROOT)}: expected {name}: {minutes} in known map"
            )

    next_class = NEXT_CLASS.read_text(encoding="utf-8")
    if "resolveJpLessonDefaultDurationFromTeachers" not in next_class:
        errors.append(
            f"{NEXT_CLASS.relative_to(ROOT)}: must resolve duration from lesson teachers"
        )
    if "teachers?" not in next_class and "teachers =" not in next_class:
        errors.append(f"{NEXT_CLASS.relative_to(ROOT)}: must accept teachers prop")

    modals = MODALS.read_text(encoding="utf-8")
    if "teachers={teachers}" not in modals or "JpLessonNextClassEditModal" not in modals:
        errors.append(
            f"{MODALS.relative_to(ROOT)}: NextClass modal must receive teachers={'{teachers}'}"
        )

    batch = BATCH.read_text(encoding="utf-8")
    if "resolveJpLessonDefaultDurationFromTeachers" not in batch:
        errors.append(
            f"{BATCH.relative_to(ROOT)}: batch modal must fill duration from selected teachers"
        )

    manual = MANUAL.read_text(encoding="utf-8")
    if "resolveJpLessonTeacherLessonMinutes" not in manual:
        errors.append(
            f"{MANUAL.relative_to(ROOT)}: manual schedule must fill duration from teacher"
        )
    if "applyTeacherName" not in manual:
        errors.append(f"{MANUAL.relative_to(ROOT)}: missing applyTeacherName helper")

    if errors:
        print("check_jp_lesson_teacher_default_duration FAILED:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("check_jp_lesson_teacher_default_duration OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
