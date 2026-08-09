#!/usr/bin/env python3
"""回归：卡片顶部保留原词条；读音+OJAD 横线在「词性」右侧。"""
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
    if "resolveJpVocabReadingPitchDisplay" not in pitch_ts:
        fail("missing resolveJpVocabReadingPitchDisplay")

    accent_tsx = (ROOT / "src/components/JpVocabPitchAccentText.tsx").read_text(
        encoding="utf-8"
    )
    if "displayText" not in accent_tsx:
        fail("JpVocabPitchAccentText must require displayText")
    if re.search(r"\{parsed\.moras\.map\([\s\S]*?\{m\.c\}", accent_tsx):
        fail("must not render OJAD mora.c directly")

    hero = (ROOT / "src/components/JpVocabFlashcardWordHero.tsx").read_text(
        encoding="utf-8"
    )
    if "pitchAccent" in hero or "JpVocabPitchAccentText" in hero:
        fail("hero must not show pitch; word stays original")
    if "jp-vocab-teacher-quiz__word-main" not in hero:
        fail("flashcard hero must show word-main")

    pos = (ROOT / "src/components/JpVocabFlashcardPosWithReading.tsx").read_text(
        encoding="utf-8"
    )
    if "JpVocabPitchAccentText" not in pos:
        fail("pos row must render pitch on reading")
    if "pos-reading-row" not in pos:
        fail("pos+reading must share one row")
    if "读音" not in pos or "reading-inline-label" not in pos:
        fail("must show 读音 label beside pitch reading")

    for name in (
        "JpVocabTeacherQuizFlashcardModal.tsx",
        "JpVocabAdminReviewFlashcardModal.tsx",
    ):
        text = (ROOT / "src/components" / name).read_text(encoding="utf-8")
        if "JpVocabFlashcardPosWithReading" not in text:
            fail(f"{name} must use JpVocabFlashcardPosWithReading next to 词性")
        # 英雄区调用块内不得再传 pitchAccent
        m = re.search(
            r"<JpVocabFlashcardWordHero\b([\s\S]*?)/>",
            text,
        )
        if not m:
            fail(f"{name} missing JpVocabFlashcardWordHero")
        if "pitchAccent" in m.group(1):
            fail(f"{name} must not pass pitchAccent into hero")

    # 学生 shared / peek 漏 pitch_accent → 卡片只有普通读音（已复发）
    share = (ROOT / "src/lib/jp-vocab-db/share.ts").read_text(encoding="utf-8")
    if "w.pitch_accent" not in share:
        fail("shared list SELECT must include w.pitch_accent")
    if "pitch_accent: row.pitch_accent" not in share:
        fail("shared list must map pitch_accent into word")
    live = (ROOT / "src/lib/jp-vocab-db/live_rollover.ts").read_text(encoding="utf-8")
    if "pitch_accent, pitch_accent_source" not in live and (
        "pitch_accent," not in live or "pitch_accent_source," not in live
    ):
        fail("peek getJpVocabWordByIdLite SELECT must include pitch_accent")
    cache = (ROOT / "src/lib/jp-vocab-study-cache.ts").read_text(encoding="utf-8")
    if "jp-api:vocab-study:v4" not in cache:
        fail("study cache must bump to v4 when pitch_accent is added to shared")

    print("ok: word intact on hero; reading+pitch beside 词性; study gets pitch")


if __name__ == "__main__":
    main()
