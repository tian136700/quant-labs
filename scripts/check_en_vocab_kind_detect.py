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
ELLIPSIS_SLOT_RE = re.compile(r"(?:…|\.{3}|～|~)")


def looks_like_grammar(raw: str) -> bool:
    word = (raw or "").strip()
    if not word:
        return False
    if AB_PATTERN_RE.search(word):
        return True
    if TENSE_NAME_RE.search(word):
        return True
    if ELLIPSIS_SLOT_RE.search(word):
        return True
    if SLOT_WORD_RE.search(word):
        return True
    if LETTER_SLOT_RE.search(word) and re.search(r"\s", word):
        return True
    return False


CASES = [
    ("both A and B", True),
    ("cater to somebody", True),
    ("either A or B", True),
    ("Present Perfect", True),
    ("look forward to", False),
    ("however", False),
    ("give up", False),
    ("attractive", False),
    ("not only A but also B", True),
    ("depend on something", True),
]


def main() -> int:
    errors: list[str] = []
    for path in (DETECT_TS, FILL_KIND_TS, ROUTE, DOCS, PY_DETECT):
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")

    detect = DETECT_TS.read_text(encoding="utf-8") if DETECT_TS.is_file() else ""
    for needle in (
        "enVocabLemmaLooksLikeGrammar",
        "SLOT_WORD_RE",
        "AB_PATTERN_RE",
        "TENSE_NAME_RE",
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

    for word, expect in CASES:
        got = looks_like_grammar(word)
        if got != expect:
            errors.append(f"heuristic {word!r}: got {got}, want {expect}")

    # Python helper 须与本文件一致
    if PY_DETECT.is_file():
        sys.path.insert(0, str(ROOT / "scripts" / "lib"))
        from en_vocab_kind_detect import en_vocab_lemma_looks_like_grammar  # type: ignore

        for word, expect in CASES:
            got = bool(en_vocab_lemma_looks_like_grammar(word))
            if got != expect:
                errors.append(f"py helper {word!r}: got {got}, want {expect}")

    if errors:
        print("FAIL check_en_vocab_kind_detect:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK check_en_vocab_kind_detect")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
