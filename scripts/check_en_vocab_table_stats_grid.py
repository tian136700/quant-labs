#!/usr/bin/env python3
"""Regression: en-vocab teacher table must not overlap stats / 从未抽查.

Fails if EnVocabPage regresses to:
- four narrow stat sub-columns (stat-detail / stat-total) instead of jp-style stats-grid
- 「从未抽查」single-line nowrap that spills into 今日抽查次数
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

    if 'colSpan={4} className="jp-vocab-stats-group"' in page:
        fail("EnVocabPage must not use 4-column stats-group header (use jp-vocab-stats-col)")
    if 'className="jp-vocab-stats-col"' not in page:
        fail("EnVocabPage must render jp-vocab-stats-col (aligned with Japanese)")
    if 'className="jp-vocab-stats-grid"' not in page:
        fail("EnVocabPage must render jp-vocab-stats-grid 2x2 body")
    if ".jp-vocab-stat-total) {\n          white-space: nowrap" in page.replace(
        "\r\n", "\n"
    ):
        fail("EnVocabPage must not force nowrap on jp-vocab-stat-total (overflows neighbor)")

    if '["从未", "抽查"]' not in shared and "['从未', '抽查']" not in shared:
        fail("formatEnVocabTotalReviewsDisplay must expose labelLines 从未/抽查")
    if "labelLines" not in shared:
        fail("en-vocab-shared formatEnVocabTotalReviewsDisplay must return labelLines")

    rule = read(".cursor/rules/en-vocab-table-actions-visible.mdc")
    if "stats-grid" not in rule or "从未" not in rule:
        fail("en-vocab-table-actions-visible.mdc must document stats-grid + 从未抽查 wrap")

    print("OK: en-vocab table stats-grid / 从未抽查 layout guards")


if __name__ == "__main__":
    main()
