#!/usr/bin/env python3
"""Regression: 有编号用法时例句用二级圈号 ①②；例句均分到各用法。

不调模型。对照 src/lib/jp-vocab-usage-examples-display.ts。
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISPLAY = ROOT / "src/lib/jp-vocab-usage-examples-display.ts"
UI = ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    src = DISPLAY.read_text(encoding="utf-8")
    for needle in (
        "jpVocabCircledExampleIndex",
        "useCircledExampleIndex",
        "0x245f",
        "examples.length % points.length === 0",
        "nestedExamples",
        "按块均分",
    ):
        if needle not in src:
            fail(f"usage-examples-display missing {needle!r}")

    if chr(0x2460) != "①":
        fail("unicode sanity")

    ui = UI.read_text(encoding="utf-8")
    if "jpVocabCircledExampleIndex" not in ui:
        fail("PairedContent 须用圈号渲染例句序号")
    if "exampleMark" not in ui:
        fail("PairedContent 须用 exampleMark 渲染例句序号")

    print("OK: circled example index + even chunk pairing")
    print("All jp-vocab usage circled-example-index checks passed.")


if __name__ == "__main__":
    main()
