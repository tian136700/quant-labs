#!/usr/bin/env python3
"""Regression: /jp-lesson 「上课中」快捷 Tab = 学习中 ∩ 李老师。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    filter_ts = (ROOT / "src/lib/lesson-mobile-status-filter.ts").read_text(encoding="utf-8")
    for needle in (
        'export type JpLessonListFilter = LessonMobileStatusFilter | "in_class"',
        "JP_LESSON_IN_CLASS_TEACHER_BASE_NAME",
        "readStoredJpLessonListFilter",
        "writeStoredJpLessonListFilter",
    ):
        if needle not in filter_ts:
            errors.append(f"lesson-mobile-status-filter.ts missing: {needle}")

    helpers = (
        ROOT / "src/components/jp-lesson-page/jp-lesson-page-helpers.tsx"
    ).read_text(encoding="utf-8")
    for needle in (
        "JP_LESSON_IN_CLASS_SECTION",
        "jpLessonAssignedToInClassTeacher",
        "jpLessonTeacherBaseNameForDuration",
    ):
        if needle not in helpers:
            errors.append(f"jp-lesson-page-helpers.tsx missing: {needle}")

    page = (ROOT / "src/components/JpLessonPage.tsx").read_text(encoding="utf-8")
    for needle in (
        "readStoredJpLessonListFilter",
        "writeStoredJpLessonListFilter",
        "inClassLessons",
        "jpLessonAssignedToInClassTeacher",
    ):
        if needle not in page:
            errors.append(f"JpLessonPage.tsx missing: {needle}")

    # 禁止日语页仍用三态 write 丢掉 in_class
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
