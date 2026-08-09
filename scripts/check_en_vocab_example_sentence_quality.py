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
                "assessEnVocabUsagePosExampleAlignment",
                "enVocabLemmaAppearsInSentence",
                "listEnVocabLemmaSurfaceForms",
                "lemma_only_example",
                "english_phrase_not_sentence",
                "missing_sentence_final_punct",
                "usage_pos_example_mismatch",
                "enVocabExampleLooksLikeStructuredDump",
                "tryCoerceEnVocabExampleStructuredDump",
                "shieldEnVocabExampleSentencesUploadText",
            ],
        ),
        (
            TS_AI,
            [
                "assessEnVocabExampleEnglishSentence",
                "assessEnVocabUsagePosExampleAlignment",
                "enVocabLemmaAppearsInSentence",
                "完整句子",
                "lemma_only_example",
                "english_phrase_not_sentence",
                "不要长难从句",
                "structured_dump",
                "usage_pos_example_mismatch",
                "词性必须对齐",
                "禁止输出 JSON / Python 列表",
            ],
        ),
        (
            PY_SCRIPT,
            [
                "assess_english_sentence",
                "assess_usage_pos_example_alignment",
                "english_phrase_not_sentence",
                "lemma_only_example",
                "usage_pos_example_mismatch",
                "expected",
            ],
        ),
        (
            RULE,
            [
                "lemma_only_example",
                "完整句门禁",
                "issue a statement",
                "时态/词形可变",
                "structured_dump",
                "str(list)",
                "usage_pos_example_mismatch",
                "are honored",
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

    # 词形：expected / got / getting 应算用到词条
    def lemma_ok(sentence: str, word: str) -> bool:
        w = word.lower()
        forms = {w, w + "s", w + "es", w + "ed", w + "ing"}
        if w.endswith("e") and len(w) > 1:
            forms.add(w + "d")
            forms.add(w[:-1] + "ing")
        if len(w) >= 3 and re.search(r"[^aeiou][aeiou][^aeiouwx]$", w):
            forms.add(w + w[-1] + "ed")
            forms.add(w + w[-1] + "ing")
        if w == "get":
            forms.update({"got", "gotten"})
        for form in forms:
            if re.search(rf"\b{re.escape(form)}\b", sentence, flags=re.I):
                return True
        return False

    for sent, word in [
        ("Students are expected to arrive early.", "expect"),
        ("I got out of the car.", "get"),
        ("She is getting better today.", "get"),
    ]:
        if not lemma_ok(sent, word):
            errors.append(f"lemma_ok failed: {word!r} in {sent!r}")

    # 用法词性 ↔ 例句形态对齐（honor 名词 vs are honored）
    import importlib.util

    py_path = ROOT / "scripts" / "en-vocab-fill-example-sentences-api.py"
    spec = importlib.util.spec_from_file_location(
        "en_vocab_fill_example_sentences_api", py_path
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assess_usage_pos_example_alignment = mod.assess_usage_pos_example_alignment

    pos_cases = [
        (
            "honor",
            "[8] 名词：荣誉、声誉",
            "We are honored to work with your company.",
            "usage_pos_example_mismatch",
        ),
        (
            "honor",
            "[8] 名词：荣誉、声誉",
            "It is an honor to work with your company.",
            None,
        ),
        (
            "honor",
            "[9] 动词：兑现、履行",
            "Please honor the terms of the contract by the deadline.",
            None,
        ),
        (
            "sweat",
            "[7] 名词：汗水。",
            "There was sweat on his hands when he signed the contract.",
            None,
        ),
    ]
    for word, usage, en, expected in pos_cases:
        got = assess_usage_pos_example_alignment(word, usage, en)
        if got != expected:
            errors.append(
                f"pos_align {word!r}: expected {expected!r} got {got!r} for {en!r}"
            )

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

    # 线上脚本：切勿 str(list)；list/dict 须还原成「英文\\n译文：」
    online = ROOT / "scripts" / "en-vocab-fill-online-batch-api.py"
    if online.is_file():
        ot = online.read_text(encoding="utf-8")
        if 'normalize_example_sentences(str(data.get("example_sentences")' in ot:
            errors.append(
                "en-vocab-fill-online-batch-api.py: must not str() example_sentences list"
            )
        if "禁止：对 list/dict 直接 str()" not in ot:
            errors.append(
                "en-vocab-fill-online-batch-api.py: missing anti-str(list) guard comment"
            )
        sys.path.insert(0, str(ROOT / "scripts" / "lib"))
        try:
            import importlib.util

            spec = importlib.util.spec_from_file_location("en_online_fill", online)
            assert spec and spec.loader
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            dump = [
                {
                    "sentence": "Air pollution is a growing concern in many cities.",
                    "translation": "译文：空气污染是许多城市日益增长的担忧。",
                },
                {
                    "sentence": "This is a matter of concern for all students.",
                    "translation": "译文：这是所有学生都值得关注的事情。",
                },
            ]
            got = mod.normalize_example_sentences(dump)
            if "Air pollution is a growing concern" not in got:
                errors.append("normalize_example_sentences(list) lost English sentence")
            if "[{'sentence'" in got or '[{"sentence"' in got:
                errors.append("normalize_example_sentences(list) still looks like dump")
            if "译文：空气污染" not in got:
                errors.append("normalize_example_sentences(list) lost Chinese gloss")
            got2 = mod.normalize_example_sentences(str(dump))
            if "[{'sentence'" in got2:
                errors.append("normalize_example_sentences(str(list)) must coerce dump")
            if "Air pollution is a growing concern" not in got2:
                errors.append("normalize_example_sentences(str(list)) failed to recover")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"online normalize_example_sentences smoke failed: {exc}")
        finally:
            lib = str(ROOT / "scripts" / "lib")
            if lib in sys.path:
                sys.path.remove(lib)
    else:
        errors.append("missing en-vocab-fill-online-batch-api.py")

    fill_lib = ROOT / "src" / "lib" / "en-vocab-fill-example-sentences.ts"
    if fill_lib.is_file():
        ft = fill_lib.read_text(encoding="utf-8")
        if "shieldEnVocabExampleSentencesUploadText" not in ft:
            errors.append("apply path must call shieldEnVocabExampleSentencesUploadText")
        if "healed:structured_dump" not in ft:
            errors.append("clear_invalid must heal structured_dump when possible")
    else:
        errors.append("missing en-vocab-fill-example-sentences.ts")

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
