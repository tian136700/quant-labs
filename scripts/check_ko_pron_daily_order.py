#!/usr/bin/env python3
"""Regression: KO daily order must follow JP familiarity priority, not id ascending."""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    daily = read("src/lib/ko-pron-daily-order.ts")
    visible = read("src/lib/ko-pron-teacher-visible.ts")
    errors: list[str] = []

    if "jpVocabFinalQuizScore" not in daily:
        errors.append("ko-pron-daily-order.ts must call jpVocabFinalQuizScore")
    if "sortKoPronLettersForDailyOrder" not in daily:
        errors.append("missing sortKoPronLettersForDailyOrder")
    if "isJpVocabWordEligibleNeverQuizzedForFront" not in daily:
        errors.append("must reuse JP never-quizzed front bucket")

    if re.search(r"\.sort\(\(a,\s*b\)\s*=>\s*a\.id\s*-\s*b\.id\)", visible):
        errors.append("ko-pron-teacher-visible.ts must not sort by id ascending")
    if "computeKoPronDailyDisplayOrder" not in visible:
        errors.append("pickKoPronVisibleIds must use computeKoPronDailyDisplayOrder")
    if 'priority_v1' not in visible and "KO_PRON_VISIBLE_ORDER_ALGO" not in visible:
        errors.append("visible pool must mark priority_v1 order_algo")

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("ok: ko-pron daily order reuses JP priority")
    return 0


if __name__ == "__main__":
    sys.exit(main())
