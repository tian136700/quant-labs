#!/usr/bin/env python3
"""Regression: Korean pronunciation review must not spoil 罗马音 behind the card."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODAL = ROOT / "src" / "components" / "KoPronReviewFlashcardModal.tsx"
PAGE = ROOT / "src" / "components" / "KoPronReviewPage.tsx"


def fail(msg: str) -> int:
    print(f"[check_ko_pron_review_no_spoiler] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    if not MODAL.is_file():
        return fail(f"missing {MODAL.relative_to(ROOT)}")
    if not PAGE.is_file():
        return fail(f"missing {PAGE.relative_to(ROOT)}")

    modal = MODAL.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")

    overlay = re.search(
        r"\.ko-pron-review-overlay\s*\{([^}]+)\}",
        modal,
        re.S,
    )
    if not overlay:
        return fail("missing .ko-pron-review-overlay styles")
    block = overlay.group(1)
    if re.search(r"rgba?\s*\(", block):
        return fail(
            "review overlay must not use translucent rgba/rgb "
            "(list behind shows 罗马音)"
        )
    if "var(--bg)" not in block and "var(--panel)" not in block:
        return fail("review overlay should use opaque var(--bg) or var(--panel)")

    if 'session ? "···"' not in page and "session ? '···'" not in page:
        return fail(
            "KoPronReviewPage must hide list readings while session is active"
        )

    if not re.search(r"\{!\s*session\s*\?\s*\(", page) and "!session ?" not in page:
        # Prefer speak button gated by !session
        if "KoPronSpeakButton" in page and "!session" not in page:
            return fail(
                "list KoPronSpeakButton must be gated off while review session runs"
            )

    print("[check_ko_pron_review_no_spoiler] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
