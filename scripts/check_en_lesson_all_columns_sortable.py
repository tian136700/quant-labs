#!/usr/bin/env python3
"""Regression: /en-lesson table headers all sortable except 教案操作."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def must_contain(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"{label}: missing {needle!r}")


def main() -> int:
    errors: list[str] = []
    sort_ts = (ROOT / "src/lib/en-lesson-table-sort.ts").read_text(encoding="utf-8")
    table = (ROOT / "src/components/en-lesson-page/EnLessonStatusTable.tsx").read_text(
        encoding="utf-8"
    )
    page = (ROOT / "src/components/EnLessonPage.tsx").read_text(encoding="utf-8")
    rule = ROOT / ".cursor/rules/en-lesson-all-columns-sortable.mdc"

    for key in [
        "id",
        "kind",
        "category",
        "content",
        "meanings",
        "count",
        "uploaded",
        "recent",
        "operator",
        "teacher",
        "classTime",
        "status",
        "notes",
    ]:
        must_contain(sort_ts, f'"{key}"', "en-lesson-table-sort keys", errors)

    must_contain(sort_ts, "buildEnLessonDisplayGroupsForTableSort", "sort", errors)
    must_contain(sort_ts, "nextEnLessonTableSort", "sort", errors)
    must_contain(table, "EnLessonThSortButton", "StatusTable", errors)
    must_contain(table, "教案操作", "StatusTable actions column", errors)
    # 操作列不得是 EnLessonThSortButton
    if 'sortKey="actions"' in table or 'sortKey={"actions"}' in table:
        errors.append("StatusTable: actions column must not be sortable")
    must_contain(page, "tableSort", "EnLessonPage", errors)
    must_contain(page, "onTableSort", "EnLessonPage", errors)

    if "onToggleClassTimeSort" in table or "classTimeSortOrder" in table:
        errors.append("StatusTable: still uses old classTime-only sort props")

    if not rule.is_file():
        errors.append("missing .cursor/rules/en-lesson-all-columns-sortable.mdc")
    else:
        rt = rule.read_text(encoding="utf-8")
        must_contain(rt, "教案操作", "rule", errors)
        must_contain(rt, "全列可排序", "rule", errors)

    if errors:
        print("FAIL")
        for e in errors:
            print(" ", e)
        return 1
    print("OK en-lesson all columns sortable except actions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
