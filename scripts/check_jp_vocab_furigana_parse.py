#!/usr/bin/env python3
"""Regression: example furigana parser must not leave 漢字かな(かな) as raw parens on screen.

Fails if JP_VOCAB_PAREN_FURIGANA_RE regresses to pure-kanji-only bases
(e.g. 静か(しずか) would leak parentheses into JpVocabFuriganaText).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "lib" / "jp-vocab-example-sentences.ts"

# Mirror of JP_VOCAB_PAREN_FURIGANA_RE (keep in sync with TS)
PAREN_FURIGANA_RE = re.compile(
    r"([\u4E00-\u9FFF々]+[ぁ-んァ-ンヴヵヶー]*)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]"
)

CASES = [
    "友達(ゆうだつ)より静か(しずか)な場所(ばしょ)が好(す)きです。",
    "彼(かれ)は私(わたし)より年上(としうえ)です。",
    "この本(ほん)はあの本(ほん)より安(やす)いです。",
    "電車(でんしゃ)に間(ま)に合(あ)いました。",
    "友達（ゆうだつ）より静か（しずか）です。",
]


def leftover_paren_kana(text: str) -> str | None:
    leftover = PAREN_FURIGANA_RE.sub(r"\1", text)
    m = re.search(r"[（(][ぁ-んァ-ン]", leftover)
    return leftover if m else None


def main() -> int:
    src = SRC.read_text(encoding="utf-8")
    if "JP_VOCAB_PAREN_FURIGANA_RE" not in src:
        print("[check_jp_vocab_furigana_parse] FAIL: regex export missing", file=sys.stderr)
        return 1
    # Must allow optional kana after kanji (な/い adjectives)
    if "+[ぁ-んァ-ンヴヵヶー]*" not in src or "JP_VOCAB_PAREN_FURIGANA_RE" not in src:
        print(
            "[check_jp_vocab_furigana_parse] FAIL: PAREN_FURIGANA_RE must allow "
            "trailing kana after kanji (静か(しずか))",
            file=sys.stderr,
        )
        return 1

    for case in CASES:
        leaked = leftover_paren_kana(case)
        if leaked is not None:
            print(
                f"[check_jp_vocab_furigana_parse] FAIL: paren kana leaked in:\n  {case}\n"
                f"  after strip: {leaked}",
                file=sys.stderr,
            )
            return 1

    print(f"[check_jp_vocab_furigana_parse] OK ({len(CASES)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
