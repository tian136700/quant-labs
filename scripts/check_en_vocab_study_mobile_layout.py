#!/usr/bin/env python3
"""Regression: /en-vocab/study mobile list must show IPA under word (reading col is hidden)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLE = ROOT / "src/components/en-vocab-study-page/EnVocabStudyPageTable.tsx"
STYLES = ROOT / "src/components/en-vocab-study-page/EnVocabStudyPageStyles.tsx"
MOBILE = ROOT / "src/app/mobile/mobile-jp-vocab.css"


def fail(msg: str) -> None:
    print(f"[check_en_vocab_study_mobile_layout] FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    table = TABLE.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")
    mobile = MOBILE.read_text(encoding="utf-8")

    if "jp-vocab-mobile-reading-row" not in table:
        fail("EnVocabStudyPageTable must put IPA under word via jp-vocab-mobile-reading-row")
    if "jp-vocab-mobile-only" not in table:
        fail("mobile reading / folds must use jp-vocab-mobile-only")
    if "EnVocabSpeakButton" not in table:
        fail("study table should expose EnVocabSpeakButton (desktop reading + mobile row)")
    if "jp-vocab-meaning-fold" not in table:
        fail("study table must use jp-vocab-meaning-fold on mobile (parity with JP study)")
    if "jp-vocab-notes-fold" not in table:
        fail("study table must use jp-vocab-notes-fold on mobile")
    if "jp-vocab-notes-desktop" not in table:
        fail("study table must wrap desktop notes in jp-vocab-notes-desktop")
    if "en-vocab-reading-cell" not in table:
        fail("desktop reading must use en-vocab-reading-cell (SourceLabel below IPA)")

    if ".jp-vocab-mobile-only" not in styles or "display: none" not in styles:
        fail("EnVocabStudyPageStyles must hide .jp-vocab-mobile-only on desktop")
    if "en-vocab-reading-cell" not in styles:
        fail("EnVocabStudyPageStyles must style en-vocab-reading-cell")
    if "jp-vocab-meaning-fold" not in styles:
        fail("EnVocabStudyPageStyles must style meaning-fold for mobile")

    if ".jp-vocab-table .jp-vocab-reading-col" not in mobile:
        fail("mobile-jp-vocab.css must hide .jp-vocab-reading-col")
    if "jp-vocab-mobile-reading-row" not in mobile:
        fail("mobile-jp-vocab.css must style jp-vocab-mobile-reading-row")
    if ".jp-vocab-notes-desktop" not in mobile:
        fail("mobile-jp-vocab.css must hide .jp-vocab-notes-desktop")

    print("[check_en_vocab_study_mobile_layout] OK")


if __name__ == "__main__":
    main()
