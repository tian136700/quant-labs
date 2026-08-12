#!/usr/bin/env python3
"""Regression: 相談する に/と 译文勿对调。

Mirrors jpVocabExampleHasSoudanParticleGlossMismatch.
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


def mismatch(ja: str, gloss: str, word: str) -> bool:
    lemma = re.sub(r"[～~〜]", "", word).strip()
    if lemma not in ("相談する", "相談"):
        return False
    compact = re.sub(r"\s+", "", PAREN_RE.sub("", ja))
    if "に相談" in compact:
        if re.search(r"(向|找|请教|咨询)", gloss):
            return False
        if re.search(r"和.+谈|和.+商量", gloss):
            return True
    if "と相談" in compact:
        if re.search(r"一起|和.+商量|跟.+商量", gloss):
            return False
        if "咨询了" in gloss or gloss.startswith("我咨询"):
            return True
    return False


CASES: list[tuple[str, str, str, bool]] = [
    ("先生に相談します。", "我会和我的老师谈谈。", "相談する", True),
    ("先生に相談します。", "我去找老师商量。", "相談する", False),
    ("友達と相談しました。", "我咨询了一位朋友。", "相談する", True),
    ("友達と相談しました。", "我和朋友商量了。", "相談する", False),
    ("先生に相談します。", "我会和老师谈谈。", "車", False),
]


def fail(msg: str) -> None:
    print(f"[check_jp_vocab_example_soudan_particle] FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    ai = AI.read_text(encoding="utf-8")
    for needle in (
        "soudan_particle_gloss_mismatch",
        "jpVocabExampleHasSoudanParticleGlossMismatch",
        "人に相談",
        'reason: "soudan_particle_gloss_mismatch"',
    ):
        if needle not in ai:
            fail(f"{AI.name} missing {needle!r}")

    if ai.count("jpVocabExampleHasSoudanParticleGlossMismatch(") < 3:
        fail("validate and online normalize must both call Soudan mismatch")

    compose = COMPOSE.read_text(encoding="utf-8")
    if "soudan_particle_gloss_mismatch" not in compose:
        fail("compose must document soudan_particle_gloss_mismatch")
    if "我会和我的老师谈谈" not in compose:
        fail("compose must show bad 和…谈 gloss for に相談")

    guard = GUARD.read_text(encoding="utf-8")
    if "soudan_particle_gloss_mismatch" not in guard:
        fail("content-quality-guard must list soudan_particle_gloss_mismatch")

    batch = BATCH.read_text(encoding="utf-8")
    if "相談する" not in batch or "向/找" not in batch:
        fail("online-batch WORD_SYSTEM must document 相談する に/と")

    edit = EDIT.read_text(encoding="utf-8")
    if "soudan_particle_gloss_mismatch" not in edit:
        fail("edit route must map soudan_particle_gloss_mismatch")

    for ja, gloss, word, expect in CASES:
        got = mismatch(ja, gloss, word)
        if got != expect:
            fail(f"case {ja!r}/{gloss!r} got={got} expected={expect}")

    print("[check_jp_vocab_example_soudan_particle] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
