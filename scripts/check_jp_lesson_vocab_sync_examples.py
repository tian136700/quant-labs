#!/usr/bin/env python3
"""Regression: jp-lesson completed sync — grammar meanings yes, word meanings no."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    lesson_db = ROOT / "src/lib/jp-lesson-db.ts"
    lesson_text = lesson_db.read_text(encoding="utf-8") if lesson_db.is_file() else ""
    if "syncLessonToVocab" not in lesson_text:
        errors.append("jp-lesson-db.ts: missing syncLessonToVocab")
    if "alignLessonItemMeanings" not in lesson_text:
        errors.append("jp-lesson-db.ts: must align meanings for grammar sync")
    if 'lesson.kind === "grammar"' not in lesson_text:
        errors.append('jp-lesson-db.ts: must gate meaning sync on kind === "grammar"')

    vocab_lesson = ROOT / "src/lib/jp-vocab-db/lesson.ts"
    vocab_text = vocab_lesson.read_text(encoding="utf-8") if vocab_lesson.is_file() else ""
    if "JP_VOCAB_LESSON_MEANING_SOURCE" not in vocab_text:
        errors.append("jp-vocab-db/lesson.ts: missing lesson meaning source constant")
    if 'kind === "grammar"' not in vocab_text:
        errors.append("jp-vocab-db/lesson.ts: meaning write must be grammar-only")

    fill = ROOT / "src/lib/jp-vocab-fill-meaning.ts"
    fill_text = fill.read_text(encoding="utf-8") if fill.is_file() else ""
    if "kind != 'grammar'" not in fill_text:
        errors.append("jp-vocab-fill-meaning.ts: must exclude grammar from fill-meaning")

    rule = ROOT / ".cursor/rules/jp-lesson-upload-examples.mdc"
    rule_text = rule.read_text(encoding="utf-8") if rule.is_file() else ""
    if "meanings" not in rule_text or "kind=grammar" not in rule_text:
        errors.append("jp-lesson-upload-examples.mdc: must document grammar meaning sync")
    if "kind=word" not in rule_text or "不同步释义" not in rule_text:
        errors.append("jp-lesson-upload-examples.mdc: must document word kind skips meanings")

    if errors:
        print("FAIL: jp-lesson vocab meaning sync guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("ok: jp-lesson vocab meaning sync (grammar only)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
