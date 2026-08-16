#!/usr/bin/env python3
"""Regression: 酷い／ひどい 译文禁止「可怕」（≈怖い）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "src/lib/jp-vocab-example-hidoi-gloss.ts"
AI = ROOT / "src/lib/jp-vocab-example-sentences-ai.ts"
GUARD = ROOT / ".cursor/rules/jp-vocab-content-quality-guard.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for p in (HELPER, AI, GUARD):
        if not p.is_file():
            fail(f"missing {p.relative_to(ROOT)}")
    h = HELPER.read_text(encoding="utf-8")
    if "jpVocabExampleHasHidoiKowaiGlossMismatch" not in h:
        fail("helper missing export")
    if "可怕" not in h:
        fail("helper must detect 可怕")
    ai = AI.read_text(encoding="utf-8")
    if "hidoi_kowai_gloss" not in ai:
        fail("validate missing hidoi_kowai_gloss")
    if "jpVocabExampleHasHidoiKowaiGlossMismatch" not in ai:
        fail("ai must call hidoi helper")
    guard = GUARD.read_text(encoding="utf-8")
    if "hidoi_kowai_gloss" not in guard:
        fail("content-quality-guard missing hidoi_kowai_gloss")
    print("OK: jp-vocab example hidoi≠可怕 gloss guard")


if __name__ == "__main__":
    main()
