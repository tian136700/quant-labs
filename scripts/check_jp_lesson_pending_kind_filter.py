#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 日语新课「未完成」单词/语法 + 有无教材筛选。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    filt = (ROOT / "src/lib/jp-lesson-pending-kind-filter.ts").read_text(encoding="utf-8")
    for needle in (
        "JpLessonPendingKindFilter",
        "readStoredJpLessonPendingKindFilter",
        "writeStoredJpLessonPendingKindFilter",
        "filterJpLessonDisplayGroupsByPendingKind",
        "countJpLessonsByPendingKind",
        "JP_LESSON_PENDING_KIND_FILTER_KEY",
        "jpLessonHasCourseLabel",
        "word_with_course",
        "word_without_course",
        "grammar_with_course",
        "grammar_without_course",
        "course_label",
        "jpLessonPendingKindFilterEmptyHint",
        "buildJpLessonPendingKindFilter",
    ):
        if needle not in filt:
            errors.append(f"missing {needle} in jp-lesson-pending-kind-filter.ts")

    page = (ROOT / "src/components/JpLessonPage.tsx").read_text(encoding="utf-8")
    if "pendingKindFilter" not in page or "setPendingKindFilter" not in page:
        errors.append("JpLessonPage must wire pendingKindFilter state")
    if "filterJpLessonDisplayGroupsByPendingKind" not in page:
        errors.append("JpLessonPage must filter pending display groups by kind")

    sections = (
        ROOT / "src/components/jp-lesson-page/JpLessonPageSections.tsx"
    ).read_text(encoding="utf-8")
    if "JpLessonPendingKindFilterBar" not in sections:
        errors.append("JpLessonPageSections must render JpLessonPendingKindFilterBar")
    if "jpLessonPendingKindFilterEmptyHint" not in sections:
        errors.append("Sections must use course-aware empty hints")

    bar = (
        ROOT / "src/components/jp-lesson-page/JpLessonPendingKindFilterBar.tsx"
    ).read_text(encoding="utf-8")
    if "jp-lesson-pending-kind-filter" not in bar:
        errors.append("FilterBar must use jp-lesson-pending-kind-filter class")
    if "未完成类型筛选" not in bar:
        errors.append("kind filter must have accessible label")
    for label in ("全部", "单词", "语法", "有教材", "无教材"):
        if label not in bar:
            errors.append(f"kind filter must include「{label}」")
    if "fixedDropdownPanelStyle" not in bar:
        errors.append("FilterBar must use fixedDropdownPanelStyle for viewport flip")
    if "aria-haspopup" not in bar:
        errors.append("word/grammar tabs must expose aria-haspopup menu")

    styles = (
        ROOT / "src/components/jp-lesson-page/JpLessonPageStyles.tsx"
    ).read_text(encoding="utf-8")
    if "jp-lesson-pending-kind-filter" not in styles:
        errors.append("JpLessonPageStyles must style pending kind filter")
    if "jp-lesson-pending-kind-menu" not in styles:
        errors.append("JpLessonPageStyles must style pending kind dropdown menu")

    rule = (
        ROOT / ".cursor/rules/jp-lesson-mobile-status-tab.mdc"
    ).read_text(encoding="utf-8")
    if "pending-kind" not in rule and "PendingKind" not in rule:
        errors.append("status-tab rule should mention pending kind filter")
    if "有教材" not in rule and "course_label" not in rule:
        errors.append("status-tab rule should mention course_label / 有教材筛选")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson pending kind filter guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
