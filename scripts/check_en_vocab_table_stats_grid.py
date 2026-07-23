#!/usr/bin/env python3
"""Regression: en-vocab teacher table must not overlap stats / 从未抽查 / 更新时间.

Fails if EnVocabPage regresses to:
- four narrow stat sub-columns (stat-detail / stat-total) instead of jp-style stats-grid
- 「从未抽查」single-line nowrap that spills into 今日抽查次数
- 「更新时间」single-line nowrap compact datetime that truncates under sticky 操作
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    page = read("src/components/EnVocabPage.tsx")
    shared = read("src/lib/en-vocab-shared.ts")
    fmt = read("src/lib/format-datetime.ts")
    page_n = page.replace("\r\n", "\n")

    if 'colSpan={4} className="jp-vocab-stats-group"' in page:
        fail("EnVocabPage must not use 4-column stats-group header (use jp-vocab-stats-col)")
    if 'className="jp-vocab-stats-col"' not in page:
        fail("EnVocabPage must render jp-vocab-stats-col (aligned with Japanese)")
    if 'className="jp-vocab-stats-grid"' not in page:
        fail("EnVocabPage must render jp-vocab-stats-grid 2x2 body")
    if ".jp-vocab-stat-total) {\n          white-space: nowrap" in page_n:
        fail("EnVocabPage must not force nowrap on jp-vocab-stat-total (overflows neighbor)")

    if '["从未", "抽查"]' not in shared and "['从未', '抽查']" not in shared:
        fail("formatEnVocabTotalReviewsDisplay must expose labelLines 从未/抽查")
    if "labelLines" not in shared:
        fail("en-vocab-shared formatEnVocabTotalReviewsDisplay must return labelLines")

    if "formatBeijingDateTimeCompactParts" not in fmt:
        fail("format-datetime must export formatBeijingDateTimeCompactParts for stacked cells")
    if "renderEnVocabUpdatedAt" not in page:
        fail("EnVocabPage must use renderEnVocabUpdatedAt (date/time stacked)")
    if "jp-vocab-updated-time--stacked" not in page:
        fail("EnVocabPage must render jp-vocab-updated-time--stacked")
    if "formatBeijingDateTimeCompact(" in page and "formatBeijingDateTimeCompactParts" not in page:
        fail("EnVocabPage must not render single-line formatBeijingDateTimeCompact in table")
    if (
        ".jp-vocab-updated-col) {\n          white-space: nowrap"
        in page_n
        or ".jp-vocab-updated-col) {\n            white-space: nowrap" in page_n
    ):
        fail("EnVocabPage must not force nowrap on jp-vocab-updated-col (truncates time)")

    rule = read(".cursor/rules/en-vocab-table-actions-visible.mdc")
    if "stats-grid" not in rule or "从未" not in rule:
        fail("en-vocab-table-actions-visible.mdc must document stats-grid + 从未抽查 wrap")
    if "updated-time--stacked" not in rule and "CompactParts" not in rule:
        fail("en-vocab-table-actions-visible.mdc must document stacked 更新时间")

    print("OK: en-vocab table stats-grid / 从未抽查 / stacked 更新时间 layout guards")


if __name__ == "__main__":
    main()
