#!/usr/bin/env python3
"""Regression: EN flashcard notes sit above level/stats panels, not in side col / below."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
STYLES = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not MODAL.is_file():
        fail(f"missing {MODAL.relative_to(ROOT)}")
    if not STYLES.is_file():
        fail(f"missing {STYLES.relative_to(ROOT)}")

    modal = MODAL.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")

    if "en-vocab-flashcard-page-footer__notes" not in modal:
        fail("modal must use en-vocab-flashcard-page-footer__notes")
    if "en-vocab-flashcard-page-footer__panels" not in modal:
        fail("modal must wrap level/stats in en-vocab-flashcard-page-footer__panels")

    # Notes must appear before panels inside footer (not below the two boxes)
    notes_pos = modal.find("en-vocab-flashcard-page-footer__notes")
    panels_pos = modal.find("en-vocab-flashcard-page-footer__panels")
    if notes_pos < 0 or panels_pos < 0 or notes_pos > panels_pos:
        fail("footer notes must appear before footer__panels (above level/stats)")

    # Side column must not host the notes section: notes marker only after footer opens
    side_idx = modal.find('className="en-vocab-flashcard-page__col-side"')
    footer_idx = modal.find('className="en-vocab-flashcard-page-footer"')
    notes_class_idx = modal.find("en-vocab-flashcard-page-footer__notes")
    if footer_idx < 0 or notes_class_idx < 0:
        fail("footer / footer__notes markers missing")
    if notes_class_idx < footer_idx:
        fail("footer__notes must be inside en-vocab-flashcard-page-footer")
    if side_idx >= 0:
        # Any jp-vocab-teacher-quiz__notes between side col open and footer open is wrong
        between = modal[side_idx:footer_idx]
        if "jp-vocab-teacher-quiz__notes" in between:
            fail("notes must not live inside en-vocab-flashcard-page__col-side")

    if "en-vocab-flashcard-page-footer__panels" not in styles:
        fail("styles must define .en-vocab-flashcard-page-footer__panels")
    if "en-vocab-flashcard-page-footer__notes" not in styles:
        fail("styles must define .en-vocab-flashcard-page-footer__notes")

    print("OK: en-vocab flashcard notes sit above level/stats footer panels")


if __name__ == "__main__":
    main()
