#!/usr/bin/env python3
"""Regression: EN flashcard lemma size beats word-link font:inherit; IPA bottom-right."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLES = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not STYLES.is_file():
        fail(f"missing {STYLES.relative_to(ROOT)}")
    if not MODAL.is_file():
        fail(f"missing {MODAL.relative_to(ROOT)}")

    styles = STYLES.read_text(encoding="utf-8")
    modal = MODAL.read_text(encoding="utf-8")

    if "en-vocab-flashcard-reading-row" not in modal:
        fail("modal must use en-vocab-flashcard-reading-row")
    if "en-vocab-flashcard-lemma-group" not in modal:
        fail("modal must wrap lemma in en-vocab-flashcard-lemma-group")

    # Dual-class selector so font-size wins over .word-link { font: inherit }
    if ".jp-vocab-teacher-quiz__word-link.en-vocab-flashcard-lemma" not in styles:
        fail(
            "styles must set font-size on "
            ".jp-vocab-teacher-quiz__word-link.en-vocab-flashcard-lemma"
        )
    if ".en-vocab-flashcard-kind" not in styles:
        fail("styles must define .en-vocab-flashcard-kind")

    ipa_block_start = styles.find(".en-vocab-flashcard-ipa {")
    if ipa_block_start < 0:
        fail("styles must define .en-vocab-flashcard-ipa")
    ipa_block = styles[ipa_block_start : ipa_block_start + 400]
    if "margin-left: auto" not in ipa_block:
        fail(".en-vocab-flashcard-ipa must use margin-left: auto (row bottom-right)")
    if "align-self: flex-end" not in ipa_block:
        fail(".en-vocab-flashcard-ipa must use align-self: flex-end")

    print("OK: en-vocab flashcard lemma/IPA layout guards present")


if __name__ == "__main__":
    main()
