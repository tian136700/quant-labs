#!/usr/bin/env python3
"""Regression: EN example sentences expose a speak control for the full sentence."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAIRED = ROOT / "src/components/EnVocabUsageExamplesPairedContent.tsx"
SPEAK = ROOT / "src/components/EnVocabSpeakButton.tsx"
ADMIN = ROOT / "src/components/EnVocabAdminReviewFlashcardModal.tsx"
STYLES = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (PAIRED, SPEAK, ADMIN, STYLES):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    paired = PAIRED.read_text(encoding="utf-8")
    admin = ADMIN.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")

    if "EnVocabSpeakButton" not in paired:
        fail("EnVocabUsageExamplesPairedContent must import EnVocabSpeakButton")
    if "朗读整句" not in paired:
        fail("paired examples must title speak as 朗读整句")
    if "en-usage-ex-paired-en-speak" not in paired:
        fail("paired examples must use en-usage-ex-paired-en-speak class")
    if "en-usage-ex-paired-en-row" not in paired:
        fail("paired examples must wrap EN sentence + speak in en-usage-ex-paired-en-row")
    if "pair.example.text" not in paired:
        fail("speak text must be the full English example sentence")

    if "EnVocabSpeakButton" not in admin:
        fail("EnVocabAdminReviewFlashcardModal word examples need EnVocabSpeakButton")
    if "朗读整句" not in admin:
        fail("admin review word examples must title speak as 朗读整句")

    if "en-usage-ex-paired-en-speak.en-vocab-speak-btn" not in styles:
        fail("flashcard styles must size .en-usage-ex-paired-en-speak")

    print("OK: EN example sentence speak (朗读整句) guards present")


if __name__ == "__main__":
    main()
