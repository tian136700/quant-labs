"""英语词条启发式：误标单词 → 语法（与 src/lib/en-vocab-kind-detect.ts 对齐）。"""

from __future__ import annotations

import re

SLOT_WORD_RE = re.compile(
    r"\b(?:somebody|someone|something|somewhere|somehow|anyone|anybody|"
    r"anything|anywhere|everybody|everyone|everything|everywhere|"
    r"nobody|nothing|nowhere|sb\.?|sth\.?)\b",
    re.I,
)
LETTER_SLOT_RE = re.compile(r"(?:^|[\s(/])[A-C](?:[\s)/]|$)")
AB_PATTERN_RE = re.compile(
    r"\b(?:both\s+[A-C]\s+and\s+[A-C]|either\s+[A-C]\s+or\s+[A-C]|"
    r"neither\s+[A-C]\s+nor\s+[A-C]|"
    r"not\s+only\s+[A-C]\s+but\s+(?:also\s+)?[A-C])\b",
    re.I,
)
TENSE_NAME_RE = re.compile(
    r"\b(?:present|past|future)\s+(?:simple|perfect|continuous|progressive|"
    r"perfect\s+continuous)\b|"
    r"\b(?:passive\s+voice|active\s+voice|conditional\s+(?:I{1,3}|1|2|3)|"
    r"subjunctive\s+mood|reported\s+speech|relative\s+clause|"
    r"attributive\s+clause)\b",
    re.I,
)
WILL_BE_PATTERN_RE = re.compile(r"\bwill\s+be\s+(?:to\b|doing\b)", re.I)
ELLIPSIS_SLOT_RE = re.compile(r"(?:…|\.{3}|～|~)")
# as ------- as possible / fill-in-the-blank 横线/下划线挖空
DASH_BLANK_SLOT_RE = re.compile(r"(?:-{3,}|_{3,}|—{2,}|－{2,})")


def en_vocab_lemma_looks_like_grammar(raw: str) -> bool:
    word = (raw or "").strip()
    if not word:
        return False
    if AB_PATTERN_RE.search(word):
        return True
    if TENSE_NAME_RE.search(word):
        return True
    if WILL_BE_PATTERN_RE.search(word):
        return True
    if ELLIPSIS_SLOT_RE.search(word):
        return True
    if DASH_BLANK_SLOT_RE.search(word):
        return True
    if SLOT_WORD_RE.search(word):
        return True
    if LETTER_SLOT_RE.search(word) and re.search(r"\s", word):
        return True
    return False
