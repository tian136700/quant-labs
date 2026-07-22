#!/usr/bin/env python3
"""Regression: every KoPron letter surface must use KoPronLetterCopyButton."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUTTON = ROOT / "src" / "components" / "KoPronLetterCopyButton.tsx"
SURFACES = [
    ROOT / "src" / "components" / "KoPronSelectPage.tsx",
    ROOT / "src" / "components" / "KoPronPage.tsx",
    ROOT / "src" / "components" / "KoPronReviewPage.tsx",
    ROOT / "src" / "components" / "KoPronReviewFlashcardModal.tsx",
    ROOT / "src" / "components" / "KoPronTeacherQuizFlashcardModal.tsx",
    ROOT / "src" / "components" / "KoPronStudyPage.tsx",
]


def fail(msg: str) -> int:
    print(f"[check_ko_pron_letter_copy] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    if not BUTTON.is_file():
        return fail("missing KoPronLetterCopyButton.tsx")
    btn = BUTTON.read_text(encoding="utf-8")
    if "copyTextToClipboard" not in btn:
        return fail("KoPronLetterCopyButton must use copyTextToClipboard")
    if "CopyToast" not in btn:
        return fail("KoPronLetterCopyButton must show CopyToast feedback")

    for path in SURFACES:
        if not path.is_file():
            return fail(f"missing {path.relative_to(ROOT)}")
        text = path.read_text(encoding="utf-8")
        if "KoPronLetterCopyButton" not in text:
            return fail(f"{path.name} must render KoPronLetterCopyButton beside letter")

    print("[check_ko_pron_letter_copy] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
