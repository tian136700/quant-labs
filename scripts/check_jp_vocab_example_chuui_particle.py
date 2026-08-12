#!/usr/bin/env python3
"""Regression: 注意する 小心某事须接「に」，禁止「を注意」。

Mirrors jpVocabExampleHasChuuiSuruWoParticle / chuui_suru_wo_particle.
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


def has_chuui_wo(ja: str, word: str) -> bool:
    lemma = re.sub(r"[～~〜]", "", word).strip()
    if lemma not in ("注意する", "注意"):
        return False
    compact = re.sub(r"\s+", "", PAREN_RE.sub("", ja))
    if "注意を払" in compact:
        return False
    return "を注意" in compact


CASES: list[tuple[str, str, bool]] = [
    ("約束(やくそく) を 注意(ちゅうい)してください。", "注意する", True),
    ("車(くるま) に 注意(ちゅうい)します。", "注意する", False),
    ("約束(やくそく) に 注意(ちゅうい)してください。", "注意する", False),
    ("注意(ちゅうい)を払(はら)います。", "注意する", False),
    ("約束を注意してください。", "約束", False),
]


def fail(msg: str) -> None:
    print(f"[check_jp_vocab_example_chuui_particle] FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    ai = AI.read_text(encoding="utf-8")
    for needle in (
        "chuui_suru_wo_particle",
        "jpVocabExampleHasChuuiSuruWoParticle",
        "約束を注意",
        'reason: "chuui_suru_wo_particle"',
    ):
        if needle not in ai:
            fail(f"{AI.name} missing {needle!r}")

    if ai.count("jpVocabExampleHasChuuiSuruWoParticle(") < 2:
        fail("validate and online normalize must both call HasChuuiSuruWoParticle")

    compose = COMPOSE.read_text(encoding="utf-8")
    if "chuui_suru_wo_particle" not in compose or "約束を注意" not in compose:
        fail("compose must document 約束を注意 / chuui_suru_wo_particle")

    guard = GUARD.read_text(encoding="utf-8")
    if "chuui_suru_wo_particle" not in guard:
        fail("content-quality-guard must list chuui_suru_wo_particle")

    batch = BATCH.read_text(encoding="utf-8")
    if "注意する" not in batch or "約束を注意" not in batch:
        fail("online-batch WORD_SYSTEM must ban 約束を注意")

    edit = EDIT.read_text(encoding="utf-8")
    if "chuui_suru_wo_particle" not in edit:
        fail("edit route must map chuui_suru_wo_particle")

    for ja, word, expect in CASES:
        got = has_chuui_wo(ja, word)
        if got != expect:
            fail(f"case word={word!r} ja={ja!r} got={got} expected={expect}")

    print("[check_jp_vocab_example_chuui_particle] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
