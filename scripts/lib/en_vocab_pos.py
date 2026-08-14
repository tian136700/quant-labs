"""英语词性：多词固定搭配误标 adj/adv → phrase（与 TS en-vocab-meaning-ai 对齐）。"""

from __future__ import annotations

import re

_SPACE_RE = re.compile(r"\s")


def en_vocab_lemma_needs_phrase_pos(raw: str) -> bool:
    word = str(raw or "").strip()
    return bool(word and _SPACE_RE.search(word))


def rewrite_pos_for_lemma(word: str, pos: str | None) -> str | None:
    """含空格的搭配若只标了 adj/adv，改成 phrase。短语动词 v / 复合介词 prep 不动。"""
    text = str(pos or "").strip()
    if not text:
        return pos
    tokens = [t for t in re.split(r"[/／]", text) if t]
    if not tokens or not en_vocab_lemma_needs_phrase_pos(word):
        return text
    lexical = [t for t in tokens if t != "phrase"]
    if not lexical:
        return text
    if all(t in ("adj", "adv") for t in lexical):
        return "phrase"
    return text
