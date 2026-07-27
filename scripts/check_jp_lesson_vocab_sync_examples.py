#!/usr/bin/env python3
"""Regression: jp-lesson completed sync — grammar examples yes, word examples no."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    db = ROOT / "src/lib/jp-lesson-db.ts"
    text = db.read_text(encoding="utf-8") if db.is_file() else ""
    if "syncLessonToVocab" not in text:
        errors.append("jp-lesson-db.ts: missing syncLessonToVocab")
    if 'lesson.kind === "grammar"' not in text:
        errors.append('jp-lesson-db.ts: syncLessonToVocab must gate on kind === "grammar"')
    if "syncExamples" not in text:
        errors.append("jp-lesson-db.ts: must use syncExamples flag for example_sentences")
    if "fill-example-sentences" not in text and "fill-example" not in text:
        # comment may mention fill-example-sentences
        pass

    rule = ROOT / ".cursor/rules/jp-lesson-upload-examples.mdc"
    rule_text = rule.read_text(encoding="utf-8") if rule.is_file() else ""
    if "kind=grammar" not in rule_text and "**`kind=grammar`**" not in rule_text:
        errors.append("jp-lesson-upload-examples.mdc: must document grammar-only example sync")
    if "kind=word" not in rule_text and "**`kind=word`**" not in rule_text:
        errors.append("jp-lesson-upload-examples.mdc: must document word kind skips examples")

    index = ROOT / "docs/feature-index.md"
    index_text = index.read_text(encoding="utf-8") if index.is_file() else ""
    if "语法类**同步例句" not in index_text and "语法类" not in index_text:
        errors.append("feature-index.md: jp-lesson row must note grammar-only example sync")

    if errors:
        print("FAIL: jp-lesson vocab example sync guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("ok: jp-lesson vocab example sync (grammar only)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
