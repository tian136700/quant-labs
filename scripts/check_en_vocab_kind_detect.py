#!/usr/bin/env python3
"""回归：英语误标单词→语法启发式（与 TS en-vocab-kind-detect 对齐）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DETECT_TS = ROOT / "src" / "lib" / "en-vocab-kind-detect.ts"
FILL_KIND_TS = ROOT / "src" / "lib" / "en-vocab-fill-kind.ts"
ROUTE = ROOT / "src" / "app" / "api" / "en-vocab" / "fill-kind" / "route.ts"
ONLINE = ROOT / "scripts" / "en-vocab-fill-online-batch-api.py"
DOCS = ROOT / "docs" / "en-vocab-fill-kind-api.txt"
PY_DETECT = ROOT / "scripts" / "lib" / "en_vocab_kind_detect.py"

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
DASH_BLANK_SLOT_RE = re.compile(r"(?:-{3,}|_{3,}|—{2,}|－{2,})")
INTERROGATIVE_SENTENCE_RE = re.compile(
    r"^(?:Are|Is|Am|Was|Were|Do|Does|Did|Will|Would|Can|Could|Shall|Should|"
    r"Have|Has|Had|May|Might|How|What|Why|When|Where|Who|Whom|Which|Whose)"
    r"\b.+\?\s*$",
    re.I,
)
DECLARATIVE_SENTENCE_RE = re.compile(
    r"^(?:I'm|I've|I'll|I'd|We're|We've|We'll|We'd|They're|They've|They'll|They'd|"
    r"You're|You've|You'll|You'd|He's|She's|It's|"
    r"(?:I|We|They|You|He|She|It)\s+"
    r"(?:am|is|are|was|were|have|has|had|will|would|can|could|shall|should|"
    r"do|does|did|may|might))"
    r"\b.+(?:\.|!)\s*$",
    re.I,
)


def looks_like_full_sentence(raw: str) -> bool:
    word = (raw or "").strip()
    if not word or word.count(" ") < 2:
        return False
    return bool(
        INTERROGATIVE_SENTENCE_RE.search(word) or DECLARATIVE_SENTENCE_RE.search(word)
    )


def looks_like_grammar(raw: str) -> bool:
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
    if looks_like_full_sentence(word):
        return True
    return False


CASES = [
    ("both A and B", True),
    ("cater to somebody", True),
    ("either A or B", True),
    ("Present Perfect", True),
    ("will be to", True),
    ("will be doing something", True),
    ("look forward to", False),
    ("however", False),
    ("give up", False),
    ("attractive", False),
    ("renew a lease", False),
    ("not only A but also B", True),
    ("depend on something", True),
    ("as ------- as possible", True),
    ("as _____ as possible", True),
    ("as ... as possible", True),
    # 无槽固定短语：保持单词，勿因模型误报 grammar 走 fill-kind
    ("within a period of time", False),
    ("in time", False),
    ("as soon as possible", False),
    # 完整疑问句作词条 → 语法（勿 incomplete_bundle:reading）
    ("Are you going for tourism?", True),
    ("How are you?", True),
    ("Will you be staying long?", True),
    ("Really?", False),
    # 完整陈述句 / 口语整句 → 语法（勿 incomplete_bundle:reading 三次熔断）
    ("I'm going sightseeing.", True),
    ("We're going shopping tomorrow!", True),
    ("I am staying for two weeks.", True),
    ("What is the purpose of your trip?", True),
    ("I'm going to the United States for tourism.", True),
]

SENTENCE_CASES = [
    ("I'm going sightseeing.", True),
    ("What is the purpose of your trip?", True),
    ("look forward to", False),
    ("both A and B", False),
    ("Really?", False),
]


def main() -> int:
    errors: list[str] = []
    for path in (DETECT_TS, FILL_KIND_TS, ROUTE, DOCS, PY_DETECT):
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")

    detect = DETECT_TS.read_text(encoding="utf-8") if DETECT_TS.is_file() else ""
    for needle in (
        "enVocabLemmaLooksLikeGrammar",
        "enVocabLemmaLooksLikeFullSentence",
        "SLOT_WORD_RE",
        "AB_PATTERN_RE",
        "TENSE_NAME_RE",
        "DASH_BLANK_SLOT_RE",
        "INTERROGATIVE_SENTENCE_RE",
        "DECLARATIVE_SENTENCE_RE",
    ):
        if needle not in detect:
            errors.append(f"detect.ts missing {needle}")

    fill = FILL_KIND_TS.read_text(encoding="utf-8") if FILL_KIND_TS.is_file() else ""
    for needle in (
        "scanEnVocabMisclassifiedKind",
        "applyEnVocabKindUpdates",
        "kind = 'grammar'",
    ):
        if needle not in fill:
            errors.append(f"fill-kind.ts missing {needle}")

    route = ROUTE.read_text(encoding="utf-8") if ROUTE.is_file() else ""
    if "scanEnVocabMisclassifiedKind" not in route:
        errors.append("route missing scan")
    if "applyEnVocabKindUpdates" not in route:
        errors.append("route missing apply")

    online = ONLINE.read_text(encoding="utf-8") if ONLINE.is_file() else ""
    if "fill-kind" not in online and "en_vocab_kind_detect" not in online:
        errors.append(
            "online-batch 未接线 fill-kind / en_vocab_kind_detect（chunk2 须接）"
        )
    for needle in (
        "ignore model kind=grammar",
        "not_grammar_like",
        "demote payload kind=grammar",
        "SYSTEM_FULL_SENTENCE",
        "en_vocab_lemma_looks_like_full_sentence",
        "口语整句",
    ):
        if needle not in online:
            errors.append(f"online-batch missing sentence/demote guard: {needle!r}")

    for word, expect in CASES:
        got = looks_like_grammar(word)
        if got != expect:
            errors.append(f"heuristic {word!r}: got {got}, want {expect}")

    for word, expect in SENTENCE_CASES:
        got = looks_like_full_sentence(word)
        if got != expect:
            errors.append(f"full_sentence {word!r}: got {got}, want {expect}")

    # Python helper 须与本文件一致
    if PY_DETECT.is_file():
        sys.path.insert(0, str(ROOT / "scripts" / "lib"))
        from en_vocab_kind_detect import (  # type: ignore
            en_vocab_lemma_looks_like_full_sentence,
            en_vocab_lemma_looks_like_grammar,
        )

        for word, expect in CASES:
            got = bool(en_vocab_lemma_looks_like_grammar(word))
            if got != expect:
                errors.append(f"py helper {word!r}: got {got}, want {expect}")
        for word, expect in SENTENCE_CASES:
            got = bool(en_vocab_lemma_looks_like_full_sentence(word))
            if got != expect:
                errors.append(f"py full_sentence {word!r}: got {got}, want {expect}")

    if errors:
        print("FAIL check_en_vocab_kind_detect:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK check_en_vocab_kind_detect")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
