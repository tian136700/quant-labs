#!/usr/bin/env python3
"""回归：例句假名漏标须点名汉字并回传 Claude 整份重写，禁止一检出就失败。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from jp_vocab_example_furigana import (  # noqa: E402
    build_furigana_retry_hint,
    describe_incomplete_furigana,
    list_unannotated_kanji,
    merge_fill_payload,
)


def main() -> int:
    errors: list[str] = []

    bad_line = "私の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。(N5)"
    missing = list_unannotated_kanji(bad_line)
    if missing != ["私"]:
        errors.append(f"list_unannotated want ['私'] got {missing}")

    ok_line = "私(わたし)の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。(N5)"
    if list_unannotated_kanji(ok_line):
        errors.append("fully annotated line must have no missing kanji")

    block = (
        "私の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。(N5)\n"
        "译文：我的兴趣是听音乐。\n"
        "あなたの趣味(しゅみ)は何(なん)ですか。(N5)\n"
        "译文：你的爱好是什么？"
    )
    detail = describe_incomplete_furigana(block)
    if not detail or "私" not in detail or "第1句" not in detail:
        errors.append(f"describe must name 私 / 第1句, got {detail!r}")

    hint = build_furigana_retry_hint(block, kind="word")
    if not hint or "CRITICAL" not in hint or "整份重写" not in hint:
        errors.append("retry hint must ask for full rewrite")
    if "reading、meaning、pos、example_sentences" not in (hint or ""):
        errors.append("word retry must ask for full four fields")

    if describe_incomplete_furigana(
        "私(わたし)の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。(N5)\n"
        "译文：我的兴趣是听音乐。\n"
        "あなたの趣味(しゅみ)は何(なん)ですか。(N5)\n"
        "译文：你的爱好是什么？"
    ):
        errors.append("good block must not describe incomplete")

    merged = merge_fill_payload(
        {
            "reading": "しゅみ",
            "meaning": "兴趣；爱好",
            "pos": "名词",
            "example_sentences": "旧例句",
        },
        {
            "example_sentences": "新例句整份",
            "meaning": "",
        },
    )
    if merged.get("reading") != "しゅみ":
        errors.append("merge must keep old reading")
    if merged.get("example_sentences") != "新例句整份":
        errors.append("merge must take new examples")
    if merged.get("meaning") != "兴趣；爱好":
        errors.append("merge must keep old meaning when new empty")

    batch = (ROOT / "scripts/jp-vocab-fill-online-batch-api.py").read_text(
        encoding="utf-8"
    )
    for needle in (
        "build_furigana_retry_hint",
        "furigana retry",
        "merge_fill_payload",
        "整份重写",
    ):
        if needle not in batch:
            errors.append(f"online-batch missing {needle!r}")

    ai = (ROOT / "src/lib/jp-vocab-example-sentences-ai.ts").read_text(
        encoding="utf-8"
    )
    if 'incomplete_kanji_furigana${suffix}' not in ai:
        errors.append("ai reject reason must append missing kanji suffix")

    sentences = (
        ROOT / "src/lib/jp-vocab-example-sentences.ts"
    ).read_text(encoding="utf-8")
    if "listJpVocabUnannotatedKanji" not in sentences:
        errors.append("ts must export listJpVocabUnannotatedKanji")
    if "describeJpVocabIncompleteFurigana" not in sentences:
        errors.append("ts must export describeJpVocabIncompleteFurigana")

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK: furigana miss → named retry rewrite (not instant fail)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
