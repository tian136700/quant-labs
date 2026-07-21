#!/usr/bin/env python3
"""Regression: ながら/によると 须有読点；日语行须有句末标点。

Mirrors jpVocabExampleMissingClauseTouten /
jpVocabExampleMissingSentenceFinalPunct in jp-vocab-example-sentences-ai.ts.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "lib" / "jp-vocab-example-sentences-ai.ts"

CLAUSE_CONNECTOR_MISSING_TOUTEN_RE = re.compile(r"(?:ながら|によると)(?=[^\s、。\n])")
PAREN_RE = re.compile(r"[（(][^）)]*[）)]")
SENTENCE_FINAL_PUNCT_RE = re.compile(r"[。！？…]$")

CLAUSE_CASES: list[tuple[str, bool]] = [
    ("食(た)べながらテレビを見(み)る。", True),
    ("食(た)べながら、テレビを見(み)る。", False),
    ("歩(ある)きながら、歌(うた)う。", False),
    ("天気予報(てんきよほう)によると今日(きょう)は晴(は)れです。", True),
    ("天気予報(てんきよほう)によると、今日(きょう)は晴(は)れです。", False),
    # 「について」不作此校验
    ("学校(がっこう)について話(はな)します。", False),
]

FINAL_CASES: list[tuple[str, bool]] = [
    ("家の下(した)に車を停めました", True),
    ("家(いえ)の下(した)に車(くるま)を停(と)めました。", False),
    ("東(ひがし)", True),
    ("東(ひがし)の空(そら)が明(あか)るいです。", False),
    ("本当(ほんとう)ですか？", False),
]


def missing_clause_touten(line: str) -> bool:
    return bool(CLAUSE_CONNECTOR_MISSING_TOUTEN_RE.search(line))


def missing_final_punct(line: str) -> bool:
    plain = PAREN_RE.sub("", line).strip()
    if not plain:
        return False
    return not bool(SENTENCE_FINAL_PUNCT_RE.search(plain))


def main() -> int:
    src = SRC.read_text(encoding="utf-8")
    for needle in (
        "missing_clause_touten",
        "missing_sentence_final_punct",
        "jpVocabExampleMissingClauseTouten",
        "jpVocabExampleMissingSentenceFinalPunct",
        "CLAUSE_CONNECTOR_MISSING_TOUTEN_RE",
    ):
        if needle not in src:
            print(
                f"[check_jp_vocab_example_punct] FAIL: {SRC.name} missing {needle}",
                file=sys.stderr,
            )
            return 1

    for line, expect in CLAUSE_CASES:
        got = missing_clause_touten(line)
        if got != expect:
            print(
                "[check_jp_vocab_example_punct] FAIL clause touten:\n"
                f"  line: {line!r}\n  got: {got} expected: {expect}",
                file=sys.stderr,
            )
            return 1

    for line, expect in FINAL_CASES:
        got = missing_final_punct(line)
        if got != expect:
            print(
                "[check_jp_vocab_example_punct] FAIL final punct:\n"
                f"  line: {line!r}\n  got: {got} expected: {expect}",
                file=sys.stderr,
            )
            return 1

    n = len(CLAUSE_CASES) + len(FINAL_CASES)
    print(f"[check_jp_vocab_example_punct] OK ({n} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
