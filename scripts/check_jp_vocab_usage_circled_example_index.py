#!/usr/bin/env python3
"""Regression: 有编号用法时例句用二级圈号 ①②；多余例句挂末条用法下。

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
        "examples.length > points.length",
        "nestedExamples",
    ):
        if needle not in src:
            fail(f"usage-examples-display missing {needle!r}")

    # ① = U+2460；fromCharCode(0x245f + 1)
    if chr(0x2460) != "①":
        fail("unicode sanity")

    ui = UI.read_text(encoding="utf-8")
    if "jpVocabCircledExampleIndex" not in ui:
        fail("PairedContent 须用圈号渲染例句序号")
    if "ni + 1}." in ui.replace(" ", "") and "exampleMark" not in ui:
        fail("禁止例句仍写死阿拉伯 ni+1.")

    print("OK: circled example index + overflow nest under last usage")
    print("All jp-vocab usage circled-example-index checks passed.")


if __name__ == "__main__":
    main()
