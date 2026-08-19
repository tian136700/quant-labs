#!/usr/bin/env python3
"""Regression: 单义词释义去重 + 卓球固定为「乒乓球」。

Fails if wiring or source rules regress.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEANING_AI = ROOT / "src/lib/jp-vocab-meaning-ai.ts"
HELPERS = ROOT / "src/lib/jp-vocab-db/helpers.ts"
NOTES = ROOT / "src/lib/jp-vocab-db/notes_fields.ts"
FILL = ROOT / "src/lib/jp-vocab-fill-meaning.ts"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    text = MEANING_AI.read_text(encoding="utf-8")
    if "JP_VOCAB_MEANING_SENSE_ALIAS" not in text:
        fail("jp-vocab-meaning-ai.ts 须定义 JP_VOCAB_MEANING_SENSE_ALIAS")
    if not re.search(r'桌球:\s*"乒乓球"', text):
        fail("别名表须含 桌球 → 乒乓球")
    if 'lemma === "卓球"' not in text or 'return "乒乓球"' not in text:
        fail("normalizeJpVocabMeaningForWord 须对 卓球 硬编码返回 乒乓球")

    for path, needle in (
        (HELPERS, "normalizeJpVocabMeaningForWord"),
        (NOTES, "normalizeJpVocabMeaningForWord"),
        (FILL, "normalizeJpVocabMeaningForWord"),
    ):
        body = path.read_text(encoding="utf-8")
        if needle not in body:
            fail(f"{path.relative_to(ROOT)} 须调用 {needle}")

    print("OK: jp-vocab meaning single-sense guard wired")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
