#!/usr/bin/env python3
"""回归：音调展示必须套在原读音上，禁止用 OJAD 平假名替换 word/reading。"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    pitch_ts = (ROOT / "src/lib/jp-vocab-pitch-accent.ts").read_text(encoding="utf-8")
    if "mapJpVocabPitchAccentOntoDisplayText" not in pitch_ts:
        fail("missing mapJpVocabPitchAccentOntoDisplayText")

    accent_tsx = (ROOT / "src/components/JpVocabPitchAccentText.tsx").read_text(
        encoding="utf-8"
    )
    if "displayText" not in accent_tsx:
        fail("JpVocabPitchAccentText must require displayText (original reading)")
    if "mapJpVocabPitchAccentOntoDisplayText" not in accent_tsx:
        fail("JpVocabPitchAccentText must map bars onto displayText")
    # 禁止直接渲染 mora.c（OJAD 平假名）作为唯一字源且不经 display 映射
    if re.search(
        r"\{parsed\.moras\.map\([\s\S]*?\{m\.c\}",
        accent_tsx,
    ):
        fail("must not render OJAD mora.c directly; use mapped displayMoras")

    hero = (ROOT / "src/components/JpVocabFlashcardWordHero.tsx").read_text(
        encoding="utf-8"
    )
    if "resolveJpVocabReadingPitchDisplay" not in hero:
        fail("flashcard hero must use resolveJpVocabReadingPitchDisplay")
    if "jp-vocab-teacher-quiz__word-main" not in hero:
        fail("flashcard hero must show word in original script")

    reading = (ROOT / "src/components/JpVocabReadingWithPitch.tsx").read_text(
        encoding="utf-8"
    )
    if "resolveJpVocabReadingPitchDisplay" not in reading:
        fail("table reading cell must use resolveJpVocabReadingPitchDisplay")

    print("ok: pitch accent overlays original reading (no OJAD kana swap)")


if __name__ == "__main__":
    main()
