#!/usr/bin/env python3
"""Regression: Korean pronunciation review must not spoil 罗马音; queue must shuffle."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODAL = ROOT / "src" / "components" / "KoPronReviewFlashcardModal.tsx"
PAGE = ROOT / "src" / "components" / "KoPronReviewPage.tsx"
SESSION = ROOT / "src" / "lib" / "ko-pron-review-session.ts"


def fail(msg: str) -> int:
    print(f"[check_ko_pron_review_no_spoiler] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    for path in (MODAL, PAGE, SESSION):
        if not path.is_file():
            return fail(f"missing {path.relative_to(ROOT)}")

    modal = MODAL.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    session = SESSION.read_text(encoding="utf-8")

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

    if "KoPronSpeakButton" in page and "!session" not in page:
        return fail(
            "list KoPronSpeakButton must be gated off while review session runs"
        )

    if "buildKoPronReviewSession" not in session:
        return fail("ko-pron-review-session must export buildKoPronReviewSession")
    if "shuffleIds" not in session and "Math.random" not in session:
        return fail("review session must shuffle catalog ids (Fisher–Yates)")
    if "buildKoPronReviewSession" not in page:
        return fail("KoPronReviewPage must start review via buildKoPronReviewSession")
    if "createKoPronReviewSession" in page:
        return fail(
            "KoPronReviewPage must not use ordered createKoPronReviewSession"
        )

    print("[check_ko_pron_review_no_spoiler] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
