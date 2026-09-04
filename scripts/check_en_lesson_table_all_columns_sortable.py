#!/usr/bin/env python3
"""Regression: /en-lesson 表头（除「教案操作」）均可排序。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SORT_LIB = ROOT / "src/lib/en-lesson-table-sort.ts"
TABLE = ROOT / "src/components/en-lesson-page/EnLessonStatusTable.tsx"
PAGE = ROOT / "src/components/EnLessonPage.tsx"

# 与 EnLessonTableSortKey / 表头 EnLessonThSortButton 对齐（教案操作列除外）
SORT_KEYS = [
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
]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    sort_lib = SORT_LIB.read_text(encoding="utf-8")
    table = TABLE.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")

    type_block = sort_lib.split("export type EnLessonTableSortKey")[1].split("export ")[0]
    for key in SORT_KEYS:
        if f'"{key}"' not in type_block:
            fail(f"en-lesson-table-sort.ts EnLessonTableSortKey missing {key!r}")

    if "function EnLessonThSortButton" not in table:
        fail("EnLessonStatusTable missing EnLessonThSortButton")

    for key in SORT_KEYS:
        if f'sortKey="{key}"' not in table:
            fail(f"EnLessonStatusTable missing sort button for {key!r}")

    if "教案操作" not in table:
        fail("action column「教案操作」must remain")
    if 'sortKey="action"' in table or 'sortKey="actions"' in table:
        fail("action column must not be sortable")

    # 「教案操作」须是普通 <th>，不能包进 ThSortButton
    if "jp-lesson-actions-col" not in table:
        fail("missing jp-lesson-actions-col on action header")
    actions_idx = table.find('className="jp-lesson-actions-col"')
    if actions_idx < 0:
        fail("jp-lesson-actions-col class missing")
    snippet = table[max(0, actions_idx - 80) : actions_idx + 40]
    if "EnLessonThSortButton" in snippet:
        fail("教案操作 must not use EnLessonThSortButton")

    if "buildEnLessonDisplayGroupsForTableSort" not in page:
        fail("EnLessonPage must use buildEnLessonDisplayGroupsForTableSort")
    if "nextEnLessonTableSort" not in page:
        fail("EnLessonPage must use nextEnLessonTableSort")
    if "onTableSort={toggleTableSort}" not in page and "onTableSort={toggleTableSort}" not in table:
        if "onTableSort={toggleTableSort}" not in page:
            fail("EnLessonPage must pass onTableSort={toggleTableSort}")

    print("OK: en-lesson all data columns sortable (except 教案操作)")


if __name__ == "__main__":
    main()
