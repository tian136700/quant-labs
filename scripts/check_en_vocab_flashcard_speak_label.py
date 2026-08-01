#!/usr/bin/env python3
"""Regression: EN flashcard uses horn+「播放本单词的录音」speak button."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLES = ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"
SPEAK = ROOT / "src/components/EnVocabSpeakButton.tsx"
BODY = (
    ROOT
    / "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageBody.tsx"
)
HERO = ROOT / "src/components/EnVocabFlashcardWordHero.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (STYLES, SPEAK, BODY, HERO):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    speak = SPEAK.read_text(encoding="utf-8")
    body = BODY.read_text(encoding="utf-8")
    hero = HERO.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")

    if '"icon" | "label"' not in speak and '"icon"|"label"' not in speak.replace(
        " ", ""
    ):
        fail("EnVocabSpeakButton must support variant icon|label")
    if "播放本单词的录音" not in speak:
        fail("EnVocabSpeakButton default label must be 播放本单词的录音")
    if "SpeakHornIcon" not in speak and "<svg" not in speak:
        fail("label variant must include horn SVG")
    if 'variant="label"' not in body:
        fail("FlashcardPageBody must use EnVocabSpeakButton variant=label")
    if "en-vocab-flashcard-speak-row" not in body:
        fail("FlashcardPageBody must wrap speak in en-vocab-flashcard-speak-row")
    if 'variant="label"' not in hero:
        fail("EnVocabFlashcardWordHero must use variant=label")
    if "en-vocab-speak-btn--label" not in styles:
        fail("flashcard styles must style .en-vocab-speak-btn--label")
    if "en-vocab-flashcard-speak-row" not in styles:
        fail("flashcard styles must define .en-vocab-flashcard-speak-row")
    if (
        ".en-vocab-speak-btn:not(.en-vocab-speak-btn--label)" not in styles
        and "en-vocab-speak-btn:not(.en-vocab-speak-btn--label)" not in styles
    ):
        fail(
            "mobile styles must size only non-label speak buttons "
            "(.en-vocab-speak-btn:not(.en-vocab-speak-btn--label))"
        )
    label_idx = styles.find(".en-vocab-speak-btn--label")
    if label_idx < 0:
        fail("missing .en-vocab-speak-btn--label block")
    label_chunk = styles[label_idx : label_idx + 500]
    if "font-weight: 700" not in label_chunk and "font-weight:700" not in label_chunk.replace(
        " ", ""
    ):
        fail("label speak button should use font-weight 700 for visibility")

    print("OK: EN flashcard speak label (horn + 播放本单词的录音) guards present")


if __name__ == "__main__":
    main()
