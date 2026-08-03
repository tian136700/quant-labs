#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 日语新课「未完成」单词/语法分类筛选。"""

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
    if "jp-lesson-pending-kind-filter" not in sections:
        errors.append("JpLessonPageSections must render pending kind filter UI")
    if "未完成类型筛选" not in sections:
        errors.append("kind filter must have accessible label")
    for label in ("全部", "单词", "语法"):
        if label not in sections:
            errors.append(f"kind filter must include「{label}」")

    styles = (
        ROOT / "src/components/jp-lesson-page/JpLessonPageStyles.tsx"
    ).read_text(encoding="utf-8")
    if "jp-lesson-pending-kind-filter" not in styles:
        errors.append("JpLessonPageStyles must style pending kind filter")

    rule = (
        ROOT / ".cursor/rules/jp-lesson-mobile-status-tab.mdc"
    ).read_text(encoding="utf-8")
    if "pending-kind" not in rule and "PendingKind" not in rule:
        errors.append("status-tab rule should mention pending kind filter")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson pending kind filter guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
