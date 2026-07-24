#!/usr/bin/env python3
"""Regression: JpVocabPageGates must not be used as JSX with `if (gate)`.

`<JpVocabPageGates />` is always a truthy React element — even when the
component returns null for authorized users — which blanks /jp-vocab.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "src/components/JpVocabPage.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not PAGE.is_file():
        fail(f"missing {PAGE.relative_to(ROOT)}")
    text = PAGE.read_text(encoding="utf-8")

    if "JpVocabPageGates" not in text:
        fail("JpVocabPage must use JpVocabPageGates for auth early returns")

    # Forbidden: assign JSX element then truthiness-check (always true)
    if re.search(
        r"const\s+gate\s*=\s*\(\s*<JpVocabPageGates[\s\S]*?if\s*\(\s*gate\s*\)",
        text,
    ):
        fail(
            "do not `const gate = (<JpVocabPageGates …/>); if (gate)` — "
            "JSX element is always truthy; call JpVocabPageGates({…}) as a function"
        )
    if re.search(r"if\s*\(\s*<JpVocabPageGates", text):
        fail("do not truthiness-check <JpVocabPageGates /> JSX")

    # Required: call as function so null means continue
    if not re.search(r"JpVocabPageGates\s*\(\s*\{", text):
        fail(
            "JpVocabPage must call JpVocabPageGates({ … }) as a function "
            "(null → continue to main UI)"
        )
    if "if (gate != null)" not in text and "if (gate !== null)" not in text:
        fail("after gates call, use `if (gate != null) return gate`")

    print("OK: JpVocabPageGates called as function (no blank-page trap)")


if __name__ == "__main__":
    main()
