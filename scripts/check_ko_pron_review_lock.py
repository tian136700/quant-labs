#!/usr/bin/env python3
"""Regression: ko-pron familiarity reselect within 1h + lock after 1h (mirror jp-vocab)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> int:
    print(f"[check_ko_pron_review_lock] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    review = (ROOT / "src/lib/ko-pron-review.ts").read_text(encoding="utf-8")
    db = (ROOT / "src/lib/ko-pron-db.ts").read_text(encoding="utf-8")
    route = (ROOT / "src/app/api/ko-pron/route.ts").read_text(encoding="utf-8")
    page = (ROOT / "src/components/KoPronPage.tsx").read_text(encoding="utf-8")

    if "KO_PRON_REVIEW_LOCK_MS" not in review:
        return fail("missing KO_PRON_REVIEW_LOCK_MS")
    if "60 * 60 * 1000" not in review:
        return fail("lock window must be 1 hour")
    if "isKoPronLetterReviewLocked" not in review:
        return fail("missing isKoPronLetterReviewLocked")

    if "isKoPronLetterReviewLocked(current)" not in db:
        return fail("recordKoPronReview must reject locked letters")
    if 'error: "review_locked"' not in db:
        return fail("recordKoPronReview must return review_locked")

    if 'code: "review_locked"' not in route and "review_locked" not in route:
        return fail("API must surface review_locked")

    if "isKoPronLetterReviewLocked" not in page:
        return fail("KoPronPage must pass reviewLocked to flashcard")
    if "reviewLocked=" not in page:
        return fail("KoPronPage must wire reviewLocked prop")

    # Same-day correction still present (within 1h edits swap counts)
    if "isCorrection: true" not in review:
        return fail("applyKoPronReview must keep same-day correction")

    print("[check_ko_pron_review_lock] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
