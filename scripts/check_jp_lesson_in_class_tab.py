#!/usr/bin/env python3
"""Regression: /jp-lesson 「上课中」= 开课前/后各 10 分钟窗口含北京时间 now（不限定老师）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    filter_ts = (ROOT / "src/lib/lesson-mobile-status-filter.ts").read_text(encoding="utf-8")
    for needle in (
        'export type JpLessonListFilter = LessonMobileStatusFilter | "in_class"',
        "readStoredJpLessonListFilter",
        "writeStoredJpLessonListFilter",
    ):
        if needle not in filter_ts:
            errors.append(f"lesson-mobile-status-filter.ts missing: {needle}")
    if "JP_LESSON_IN_CLASS_TEACHER_BASE_NAME" in filter_ts:
        errors.append(
            "lesson-mobile-status-filter.ts must not hardcode IN_CLASS teacher name"
        )

    shared = (ROOT / "src/lib/jp-lesson-shared.ts").read_text(encoding="utf-8")
    if "export function isJpLessonCurrentlyInClass" not in shared:
        errors.append("jp-lesson-shared.ts missing isJpLessonCurrentlyInClass")
    if "JP_LESSON_IN_CLASS_MARK_WINDOW_MINUTES = 10" not in shared:
        errors.append(
            "jp-lesson-shared.ts missing JP_LESSON_IN_CLASS_MARK_WINDOW_MINUTES = 10"
        )
    if "buildJpLessonScheduleEvents(lesson)" not in shared:
        errors.append("isJpLessonCurrentlyInClass should reuse buildJpLessonScheduleEvents")
    if "event.end.getTime()" in shared.split("export function isJpLessonCurrentlyInClass", 1)[-1].split(
        "export function flattenJpLessonScheduleEvents", 1
    )[0]:
        errors.append(
            "isJpLessonCurrentlyInClass must use ±10min around class start, not full [start, end)"
        )

    helpers = (
        ROOT / "src/components/jp-lesson-page/jp-lesson-page-helpers.tsx"
    ).read_text(encoding="utf-8")
    for needle in ("JP_LESSON_IN_CLASS_SECTION", 'title: "上课中"'):
        if needle not in helpers:
            errors.append(f"jp-lesson-page-helpers.tsx missing: {needle}")
    if "jpLessonAssignedToInClassTeacher" in helpers:
        errors.append("jp-lesson-page-helpers must not filter 上课中 by teacher name")

    page = (ROOT / "src/components/JpLessonPage.tsx").read_text(encoding="utf-8")
    for needle in (
        "readStoredJpLessonListFilter",
        "writeStoredJpLessonListFilter",
        "inClassLessons",
        "isJpLessonCurrentlyInClass",
        "setInterval(() => setNow(new Date()), 60_000)",
    ):
        if needle not in page:
            errors.append(f"JpLessonPage.tsx missing: {needle}")
    if "jpLessonAssignedToInClassTeacher" in page:
        errors.append("JpLessonPage must not filter 上课中 by teacher name")
    if "writeStoredLessonMobileStatusFilter(JP_LESSON_MOBILE_STATUS_FILTER_KEY" in page:
        errors.append(
            "JpLessonPage must use writeStoredJpLessonListFilter, not three-state write"
        )

    sections = (
        ROOT / "src/components/jp-lesson-page/JpLessonPageSections.tsx"
    ).read_text(encoding="utf-8")
    for needle in (
        'setMobileStatusFilter("in_class")',
        "jp-lesson-status-card--in_class",
        "jp-lesson-mobile-status-tab--in_class",
        "JP_LESSON_IN_CLASS_SECTION",
    ):
        if needle not in sections:
            errors.append(f"JpLessonPageSections.tsx missing: {needle}")
    if "李老师" in sections:
        errors.append("JpLessonPageSections must not label 上课中 as 李老师")

    styles = (
        ROOT / "src/components/jp-lesson-page/JpLessonPageStyles.tsx"
    ).read_text(encoding="utf-8")
    for needle in (
        "jp-lesson-mobile-filter-in_class",
        "jp-lesson-mobile-status-tab--in_class",
        "jp-lesson-status-card--in_class",
    ):
        if needle not in styles:
            errors.append(f"JpLessonPageStyles.tsx missing: {needle}")

    mobile = (ROOT / "src/app/mobile/mobile-jp-lesson.css").read_text(encoding="utf-8")
    for needle in (
        "jp-lesson-mobile-filter-in_class",
        "jp-lesson-mobile-status-tab--in_class",
    ):
        if needle not in mobile:
            errors.append(f"mobile-jp-lesson.css missing: {needle}")

    if errors:
        print("check_jp_lesson_in_class_tab FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("check_jp_lesson_in_class_tab OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
