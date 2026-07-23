#!/usr/bin/env python3
"""Regression: English example lines must be full sentences, not lemma/phrase stubs.

Mirrors assessEnVocabExampleEnglishSentence in en-vocab-example-sentences.ts
and validateEnVocabExampleSentencesAiOutput gates.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TS_SENT = ROOT / "src" / "lib" / "en-vocab-example-sentences.ts"
TS_AI = ROOT / "src" / "lib" / "en-vocab-example-sentences-ai.ts"
PY_SCRIPT = ROOT / "scripts" / "en-vocab-fill-example-sentences-api.py"
RULE = ROOT / ".cursor" / "rules" / "en-vocab-fill.mdc"

HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
GLOSS_LABEL_RE = re.compile(r"^(译文|翻譯|翻译|译|譯)\s*[:：]\s*")
EN_SENTENCE_FINAL_PUNCT_RE = re.compile(r"""[.!?]"?'?\s*$""")
EN_FINITE_HINT_RE = re.compile(
    r"\b(?:am|is|are|was|were|be|been|being|do|does|did|have|has|had|"
    r"will|would|can|could|may|might|must|should|shall|need|needs|ought)\b",
    re.I,
)


def english_word_tokens(text: str) -> list[str]:
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text or "")


def assess(english: str, word: str, gloss: str = "") -> str | None:
    en = (english or "").strip()
    if not en:
        return "english_not_sentence"
    tokens = english_word_tokens(en)
    lemma_tokens = english_word_tokens(word)
    if (
        lemma_tokens
        and len(tokens) == len(lemma_tokens)
        and all(t.lower() == lemma_tokens[i].lower() for i, t in enumerate(tokens))
    ):
        return "lemma_only_example"
    if len(tokens) < 3:
        return "english_not_sentence"
    if not EN_SENTENCE_FINAL_PUNCT_RE.search(en):
        return "missing_sentence_final_punct"
    starts_with_lemma = (
        bool(lemma_tokens)
        and len(tokens) >= len(lemma_tokens)
        and all(
            tokens[i].lower() == lemma_tokens[i].lower()
            for i in range(len(lemma_tokens))
        )
    )
    if starts_with_lemma and len(tokens) <= 5 and not EN_FINITE_HINT_RE.search(en):
        return "english_phrase_not_sentence"
    gloss_body = gloss or ""
    for _ in range(8):
        nxt = GLOSS_LABEL_RE.sub("", gloss_body)
        nxt = re.sub(r"^[\s／/]+", "", nxt).strip()
        if nxt == gloss_body:
            break
        gloss_body = nxt
    if len(HAN_RE.findall(gloss_body)) >= 8 and len(tokens) < 4:
        return "english_too_short_vs_gloss"
    return None


CASES: list[tuple[str, str, str, str | None]] = [
    # english, word, gloss, expected_reason (None = ok)
    ("issue", "issue", "译文：问题是今天讨论的主要内容。", "lemma_only_example"),
    (
        "issue a statement",
        "issue",
        "译文：政府发布了关于洪水警告的声明。",
        "missing_sentence_final_punct",
    ),
    (
        "Issue a statement.",
        "issue",
        "译文：政府发布了关于洪水警告的声明。",
        "english_phrase_not_sentence",
    ),
    (
        "The issue is hard to solve today.",
        "issue",
        "译文：这个问题今天很难解决。",
        None,
    ),
    (
        "The government will issue a statement soon.",
        "issue",
        "译文：政府很快会发布一份声明。",
        None,
    ),
    (
        "Issue is hard today.",
        "issue",
        "译文：问题今天很难。",
        None,
    ),
]


def main() -> int:
    errors: list[str] = []

    for path, needles in [
        (
            TS_SENT,
            [
                "assessEnVocabExampleEnglishSentence",
                "lemma_only_example",
                "english_phrase_not_sentence",
                "missing_sentence_final_punct",
            ],
        ),
        (
            TS_AI,
            [
                "assessEnVocabExampleEnglishSentence",
                "完整句子",
                "lemma_only_example",
                "english_phrase_not_sentence",
            ],
        ),
        (
            PY_SCRIPT,
            [
                "assess_english_sentence",
                "english_phrase_not_sentence",
                "lemma_only_example",
            ],
        ),
        (
            RULE,
            [
                "lemma_only_example",
                "完整句子",
                "issue a statement",
            ],
        ),
    ]:
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")
            continue
        text = path.read_text(encoding="utf-8")
        for n in needles:
            if n not in text:
                errors.append(f"{path.name}: missing {n!r}")

    route = ROOT / "src/app/api/en-vocab/fill-example-sentences/route.ts"
    if route.is_file():
        rt = route.read_text(encoding="utf-8")
        if "clear_invalid" not in rt:
            errors.append("fill-example-sentences route: missing clear_invalid")
    else:
        errors.append("missing fill-example-sentences route")

    for en, word, gloss, expected in CASES:
        got = assess(en, word, gloss)
        if got != expected:
            errors.append(
                f"assess({en!r}, {word!r}): got {got!r}, expected {expected!r}"
            )

    if errors:
        print("[check_en_vocab_example_sentence_quality] FAIL:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(
        f"[check_en_vocab_example_sentence_quality] OK "
        f"({len(CASES)} cases + source guards)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
