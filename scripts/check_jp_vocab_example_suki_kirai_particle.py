#!/usr/bin/env python3
"""Regression: 好き／嫌い 对象须接「が」，禁止「は嫌いです」。

Mirrors jpVocabExampleHasSukiKiraiWaParticle / suki_kirai_wa_particle.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AI = ROOT / "src" / "lib" / "jp-vocab-example-sentences-ai.ts"
COMPOSE = ROOT / ".cursor" / "rules" / "jp-vocab-example-sentences-compose.mdc"
GUARD = ROOT / ".cursor" / "rules" / "jp-vocab-content-quality-guard.mdc"
BATCH = ROOT / "scripts" / "jp-vocab-fill-online-batch-api.py"
EDIT = ROOT / "src" / "app" / "api" / "jp-vocab" / "edit" / "route.ts"

PAREN_RE = re.compile(r"[（(][^）)]*[）)]")
STEMS = {"好き", "嫌い", "大好き", "大嫌い"}
WA_PRED_RE = re.compile(
    r"は(?:あまり|全然|とても|ちょっと|少し|まだ|もう|そんなに|すごく|本当に)*(?:大)?(?:好き|嫌い)(?!な)"
)


def has_suki_kirai_wa(ja: str, word: str) -> bool:
    lemma = re.sub(r"[～~〜]", "", word).strip()
    if lemma.endswith("だ"):
        lemma = lemma[:-1]
    if lemma not in STEMS:
        return False
    compact = re.sub(r"\s+", "", PAREN_RE.sub("", ja))
    return bool(WA_PRED_RE.search(compact))


CASES: list[tuple[str, str, bool]] = [
    ("魚(さかな) は 嫌(きら)いです。", "嫌い", True),
    ("魚(さかな) が 嫌(きら)いです。", "嫌い", False),
    ("野菜(やさい) が 嫌(きら)いだ。", "嫌い", False),
    ("私(わたし) は 魚(さかな) が 嫌(きら)いです。", "嫌い", False),
    ("これは嫌(きら)いな食(た)べ物(もの)です。", "嫌い", False),
    ("猫(ねこ)が好(す)きだ。", "好き", False),
    ("音楽(おんがく) は 好(す)きです。", "好き", True),
    ("魚は嫌いです。", "魚", False),
]


def fail(msg: str) -> None:
    print(f"[check_jp_vocab_example_suki_kirai_particle] FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    ai = AI.read_text(encoding="utf-8")
    for needle in (
        "suki_kirai_wa_particle",
        "jpVocabExampleHasSukiKiraiWaParticle",
        "jpVocabSukiKiraiParticlePromptHint",
        "魚は嫌いです",
        "两句都用が",
        'reason: "suki_kirai_wa_particle"',
    ):
        if needle not in ai:
            fail(f"{AI.name} missing {needle!r}")

    if "jpVocabSukiKiraiParticlePromptHint(input.word)" not in ai:
        fail("buildJpVocabExampleSentencesAiPrompt must pin lemma-side が hint")

    if ai.count("jpVocabExampleHasSukiKiraiWaParticle(") < 2:
        fail("validate and online normalize must both call HasSukiKiraiWaParticle")

    compose = COMPOSE.read_text(encoding="utf-8")
    if "suki_kirai_wa_particle" not in compose or "魚は嫌いです" not in compose:
        fail("compose must document 魚は嫌いです / suki_kirai_wa_particle")

    guard = GUARD.read_text(encoding="utf-8")
    if "suki_kirai_wa_particle" not in guard:
        fail("content-quality-guard must list suki_kirai_wa_particle")

    batch = BATCH.read_text(encoding="utf-8")
    if "魚は嫌いです" not in batch:
        fail("online-batch WORD_SYSTEM must ban 魚は嫌いです")
    if "_suki_kirai_particle_hint" not in batch or "两句都用が" not in batch:
        fail("online-batch build_prompt must pin lemma-side が hint")

    edit = EDIT.read_text(encoding="utf-8")
    if "suki_kirai_wa_particle" not in edit:
        fail("edit route must map suki_kirai_wa_particle")

    for ja, word, expect in CASES:
        got = has_suki_kirai_wa(ja, word)
        if got != expect:
            fail(f"case word={word!r} ja={ja!r} got={got} expected={expect}")

    print("[check_jp_vocab_example_suki_kirai_particle] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
