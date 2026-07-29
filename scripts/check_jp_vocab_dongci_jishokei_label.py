#!/usr/bin/env python3
"""Regression: 「动词辞书形」须规范成「动词辞书形（动词原形）」。

对照 src/lib/jp-vocab-connection-ai.ts / JpVocabConnectionSection。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONN = ROOT / "src/lib/jp-vocab-connection-ai.ts"
UI = ROOT / "src/components/JpVocabConnectionSection.tsx"

RE = re.compile(r"动词辞书形(?:（动词原形）|\(动词原形\))?")


def format_label(raw: str) -> str:
    return RE.sub("动词辞书形（动词原形）", raw)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    src = CONN.read_text(encoding="utf-8")
    for needle in (
        "formatJpVocabDongciJishokeiLabel",
        "动词辞书形（动词原形）",
        "formatJpVocabDongciJishokeiLabel(line)",
    ):
        if needle not in src:
            fail(f"connection-ai missing {needle!r}")

    ui = UI.read_text(encoding="utf-8")
    if "normalizeJpVocabConnectionText" not in ui:
        fail("ConnectionSection 展示须走 normalize（含辞书形注解）")

    bare = "动词辞书形＋「前に」 / 名词＋の前に"
    got = format_label(bare)
    if got != "动词辞书形（动词原形）＋「前に」 / 名词＋の前に":
        fail(f"bare expand failed: {got!r}")

    already = "动词辞书形（动词原形）＋「前に」"
    if format_label(already) != already:
        fail("already annotated must not double")

    half = "动词辞书形(动词原形)＋「前に」"
    if format_label(half) != "动词辞书形（动词原形）＋「前に」":
        fail(f"half-width paren normalize failed: {format_label(half)!r}")

    print("OK: 动词辞书形 → 动词辞书形（动词原形）")
    print("All jp-vocab dongci-jishokei label checks passed.")


if __name__ == "__main__":
    main()
