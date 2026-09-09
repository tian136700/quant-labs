"""英语词性：多词固定搭配误标 adj/adv → phrase（与 TS en-vocab-meaning-ai 对齐）。"""

from __future__ import annotations

import re

_SPACE_RE = re.compile(r"\s")
_BARE_ADJ_ADV_USAGE_RE = re.compile(r"^(形容词|副词)\s*[：:]\s*(.*)$")
_NUMBERED_USAGE_RE = re.compile(r"^(\d+)\s*[.、．)\]]\s*(.+)$")
_ALREADY_PHRASE_RE = re.compile(r"^短语\s*[：:]")
_FREQ_PREFIX_RE = re.compile(
    r"^(\[\s*口语\s*[：:]?\s*\d{1,2}\s*[|｜]\s*考试\s*[：:]?\s*\d{1,2}\s*\]\s*)(.*)$"
)


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


def rewrite_phrase_bare_adj_adv_usage_body(word: str, body: str) -> str:
    """多词搭配误写「形容词：/副词：」→「短语：作定语/状语用，…」（对齐 TS）。"""
    if not en_vocab_lemma_needs_phrase_pos(word):
        return body
    trimmed = str(body or "").strip()
    m = _BARE_ADJ_ADV_USAGE_RE.match(trimmed)
    if not m:
        return body
    role = "作定语用" if m.group(1) == "形容词" else "作状语用"
    rest = str(m.group(2) or "").strip()
    if _ALREADY_PHRASE_RE.match(rest):
        return rest
    return f"短语：{role}，{rest}" if rest else f"短语：{role}"


def rewrite_phrase_bare_adj_adv_usage(word: str, usage: str) -> str:
    """整段 usage 编号行：裸形容词/副词标签改成短语（防 incomplete_bundle:usage）。"""
    text = str(usage or "").strip()
    if not text or not en_vocab_lemma_needs_phrase_pos(word):
        return text
    out: list[str] = []
    for line in text.splitlines():
        trimmed = line.strip()
        if not trimmed:
            continue
        m = _NUMBERED_USAGE_RE.match(trimmed)
        if not m:
            out.append(trimmed)
            continue
        n, body = m.group(1), m.group(2).strip()
        freq_m = _FREQ_PREFIX_RE.match(body)
        if freq_m:
            prefix, rest = freq_m.group(1), freq_m.group(2)
            out.append(
                f"{n}. {prefix}{rewrite_phrase_bare_adj_adv_usage_body(word, rest)}"
            )
        else:
            out.append(
                f"{n}. {rewrite_phrase_bare_adj_adv_usage_body(word, body)}"
            )
    return "\n".join(out).strip()
