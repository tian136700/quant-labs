#!/usr/bin/env python3
"""Regression: EN share must NOT auto-mark familiarity (only teacher checkbox)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARE = ROOT / "src/lib/en-vocab-db/share.ts"
HOOK = ROOT / "src/hooks/useEnVocabReviewActions.ts"


def main() -> int:
    errors: list[str] = []
    share = SHARE.read_text(encoding="utf-8") if SHARE.is_file() else ""
    hook = HOOK.read_text(encoding="utf-8") if HOOK.is_file() else ""

    if not share:
        errors.append("missing share.ts")
    else:
        for bad in [
            "recordEnVocabReview",
            "share_weak",
            "isEnVocabWordCheckedToday",
        ]:
            if bad in share:
                errors.append(f"share.ts must not contain {bad!r}")

    if not hook:
        errors.append("missing useEnVocabReviewActions.ts")
    elif "并标记为不熟悉" in hook:
        errors.append("share UI must not claim auto-mark weak")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    print("OK: en-vocab share does not auto-mark review")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
