#!/usr/bin/env python3
"""Regression: 間／あいだ 假句与「の間に」误译成「……后」。

Mirrors jpVocabExampleHasAidaFakeStatePredicate /
jpVocabExampleGlossTreatsAidaNiAsAfter.
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


def strip_paren(line: str) -> str:
    return PAREN_RE.sub("", line)


def has_aida_fake_state(ja: str, gloss: str) -> bool:
    compact = re.sub(r"\s+", "", strip_paren(ja))
    if not re.search(r"(?:しい|い)間です", compact):
        return False
    if "長い間です" in compact:
        return False
    if re.search(r"(之间|中间|期间|时候|其间)", gloss):
        return False
    return True


def gloss_aida_ni_as_after(ja: str, gloss: str) -> bool:
    compact = re.sub(r"\s+", "", strip_paren(ja))
    if not re.search(r"間に|あいだに", compact):
        return False
    if re.search(r"(之内|以内|期间|之间|时候)", gloss):
        return False
    cleaned = re.sub(r"后面|后方|后边|後麵|後边|后半|後頭|后头", "", gloss)
    cleaned = re.sub(r"之後|以后", "后", cleaned)
    return "后" in cleaned


CASES_FAKE: list[tuple[str, str, bool]] = [
    ("今(いま)、忙(いそが)しい間(あいだ)です。", "我现在很忙。", True),
    ("本(ほん)とノートの間(あいだ)に、ペンがあります。", "书和笔记本之间有一支笔。", False),
    ("会議(かいぎ)の間(あいだ)、静(しず)かにしてください。", "开会期间，请保持安静。", False),
    ("長い間です。", "好久不见。", False),
]

CASES_AFTER: list[tuple[str, str, bool]] = [
    ("一(いち)時間(じかん)の間(あいだ)に終(お)わります。", "一小时后就结束了。", True),
    ("一(いち)時間(じかん)の間(あいだ)に終(お)わります。", "一小时内就结束。", False),
    ("会議(かいぎ)の間(あいだ)、静(しず)かにしてください。", "开会期间，请保持安静。", False),
]


def fail(msg: str) -> None:
    print(f"[check_jp_vocab_example_aida_gloss] FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    ai = AI.read_text(encoding="utf-8")
    for needle in (
        "aida_fake_state_predicate",
        "gloss_aida_ni_as_after",
        "jpVocabExampleHasAidaFakeStatePredicate",
        "jpVocabExampleGlossTreatsAidaNiAsAfter",
        "忙しい間です",
        'reason: "aida_fake_state_predicate"',
        'reason: "gloss_aida_ni_as_after"',
    ):
        if needle not in ai:
            fail(f"{AI.name} missing {needle!r}")

    if ai.count("jpVocabExampleHasAidaFakeStatePredicate(") < 2:
        fail("validate and online normalize must both call HasAidaFakeStatePredicate")
    if ai.count("jpVocabExampleGlossTreatsAidaNiAsAfter(") < 2:
        fail("validate and online normalize must both call GlossTreatsAidaNiAsAfter")

    compose = COMPOSE.read_text(encoding="utf-8")
    if "aida_fake_state_predicate" not in compose or "忙しい間" not in compose:
        fail("compose rule must document 忙しい間 / aida_fake_state_predicate")

    guard = GUARD.read_text(encoding="utf-8")
    if "aida_fake_state_predicate" not in guard or "gloss_aida_ni_as_after" not in guard:
        fail("content-quality-guard must list aida reject reasons")

    batch = BATCH.read_text(encoding="utf-8")
    if "間／あいだ" not in batch or "忙しい間です" not in batch:
        fail("online-batch WORD_SYSTEM must ban 忙しい間です")

    edit = EDIT.read_text(encoding="utf-8")
    if "aida_fake_state_predicate" not in edit or "gloss_aida_ni_as_after" not in edit:
        fail("edit route must map aida gloss error messages")

    for ja, gloss, expect in CASES_FAKE:
        got = has_aida_fake_state(ja, gloss)
        if got != expect:
            fail(f"fake: ja={ja!r} gloss={gloss!r} got={got} expected={expect}")

    for ja, gloss, expect in CASES_AFTER:
        got = gloss_aida_ni_as_after(ja, gloss)
        if got != expect:
            fail(f"after: ja={ja!r} gloss={gloss!r} got={got} expected={expect}")

    print("[check_jp_vocab_example_aida_gloss] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
