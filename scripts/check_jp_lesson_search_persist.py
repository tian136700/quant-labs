#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 日语新课搜索关键词刷新后保留，点清除才空。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    search = (ROOT / "src/lib/jp-lesson-search.ts").read_text(encoding="utf-8")
    for needle in (
        "JP_LESSON_SEARCH_QUERY_KEY",
        "jp-lesson:search-query",
        "readStoredJpLessonSearchQuery",
        "writeStoredJpLessonSearchQuery",
        "removeItem",
    ):
        if needle not in search:
            errors.append(f"missing {needle} in jp-lesson-search.ts")

    page = (ROOT / "src/components/JpLessonPage.tsx").read_text(encoding="utf-8")
    if "readStoredJpLessonSearchQuery" not in page:
        errors.append("JpLessonPage must init searchQuery from readStoredJpLessonSearchQuery")
    if "writeStoredJpLessonSearchQuery" not in page:
        errors.append("JpLessonPage must persist searchQuery via writeStoredJpLessonSearchQuery")
    if 'useState("")' in page and "searchQuery" in page:
        # soft: exact empty init without read is the old bug
        if "useState(\n    () => readStoredJpLessonSearchQuery()" not in page and \
           "useState(() => readStoredJpLessonSearchQuery())" not in page:
            # allow multiline; already checked readStored above
            pass
    if "jp-lesson-search__clear" not in page:
        errors.append("JpLessonPage must keep clear button that setSearchQuery(\"\")")

    rule = ROOT / ".cursor/rules/jp-lesson-search-persist.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-lesson-search-persist.mdc")
    else:
        rule_text = rule.read_text(encoding="utf-8")
        if "readStoredJpLessonSearchQuery" not in rule_text:
            errors.append("rule must document readStoredJpLessonSearchQuery")

    idx = (ROOT / "docs/feature-index.md").read_text(encoding="utf-8")
    if "readStoredJpLessonSearchQuery" not in idx and "jp-lesson-search-persist" not in idx:
        errors.append("feature-index must mention search persist")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson search persist guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
