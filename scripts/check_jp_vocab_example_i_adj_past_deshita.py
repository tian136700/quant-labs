#!/usr/bin/env python3
"""Regression: 一类形容词过去式禁止叠「でした」（かったでした）。

Mirrors jpVocabExampleHasIAdjPastDeshita / reject i_adj_past_deshita.
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
I_ADJ_PAST_DESHITA_RE = re.compile(r"かったでした")

CASES: list[tuple[str, bool]] = [
    ("あの映画(えいが)はとても面白(おもしろ)かったでしたね。", True),
    ("あの映画(えいが)はとても面白(おもしろ)かったですね。", False),
    ("昨日(きのう)は暑(あつ)かったです。", False),
    ("出張(しゅっちょう)でしたね。", False),
    ("静(しず)かでしたね。", False),
    ("寒(さむ)くなかったでした。", True),
]


def has_i_adj_past_deshita(line: str) -> bool:
    plain = PAREN_RE.sub("", line)
    return bool(I_ADJ_PAST_DESHITA_RE.search(plain))


def fail(msg: str) -> None:
    print(f"[check_jp_vocab_example_i_adj_past_deshita] FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    ai = AI.read_text(encoding="utf-8")
    for needle in (
        "i_adj_past_deshita",
        "jpVocabExampleHasIAdjPastDeshita",
        "I_ADJ_PAST_DESHITA_RE",
        "面白かったでした",
        "面白かったですね",
        # validate + online normalize both reject
        'reason: "i_adj_past_deshita"',
    ):
        if needle not in ai:
            fail(f"{AI.name} missing {needle!r}")

    # both code paths call the helper
    if ai.count("jpVocabExampleHasIAdjPastDeshita(") < 2:
        fail("validate and online normalize must both call jpVocabExampleHasIAdjPastDeshita")

    compose = COMPOSE.read_text(encoding="utf-8")
    if "かったでした" not in compose or "i_adj_past_deshita" not in compose:
        fail("compose rule must document かったでした / i_adj_past_deshita")

    guard = GUARD.read_text(encoding="utf-8")
    if "i_adj_past_deshita" not in guard:
        fail("content-quality-guard must list i_adj_past_deshita")

    batch = BATCH.read_text(encoding="utf-8")
    if "一类形容词过去" not in batch or "かったでした" not in batch:
        fail("online-batch GRAMMAR/WORD system must ban かったでした")

    edit = EDIT.read_text(encoding="utf-8")
    if "i_adj_past_deshita" not in edit:
        fail("edit route must map i_adj_past_deshita error message")

    for line, expect in CASES:
        got = has_i_adj_past_deshita(line)
        if got != expect:
            fail(f"pattern: line={line!r} got={got} expected={expect}")

    print("[check_jp_vocab_example_i_adj_past_deshita] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
