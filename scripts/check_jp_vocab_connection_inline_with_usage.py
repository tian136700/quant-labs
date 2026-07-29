#!/usr/bin/env python3
"""Regression: 接续贴在用法下（用法N 换行拆分 + 内联展示，不单独「接序」块）。

对照 jp-vocab-connection-ai.ts / JpVocabUsageExamplesPairedContent。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONN = ROOT / "src/lib/jp-vocab-connection-ai.ts"
UI = ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"
QUIZ = ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def expand_breaks(raw: str) -> str:
    t = raw.replace("\r\n", "\n")
    t = re.sub(r"([^\n])\s*(?=用法\s*\d+\s*[：:])", r"\1\n", t)
    t = re.sub(r"([^\n])\s*(?=(?:否定形|肯定形)\s*[：:])", r"\1\n", t)
    return t


def main() -> None:
    src = CONN.read_text(encoding="utf-8")
    for needle in (
        "parseJpVocabConnectionDisplayParts",
        "expandJpVocabConnectionUsageInlineBreaks",
        "jpVocabConnectionShownInlineWithUsage",
    ):
        if needle not in src:
            fail(f"connection-ai missing {needle!r}")

    ui = UI.read_text(encoding="utf-8")
    if "接续：" not in ui:
        fail("PairedContent 须显示「接续：」")
    if "connectionTextFor" not in ui and "connText" not in ui:
        fail("PairedContent 须按用法挂接续")

    quiz = QUIZ.read_text(encoding="utf-8")
    if "inlineConnection" not in quiz:
        fail("抽问卡内联接续时须隐藏单独接序块")
    if "connection={w.connection}" not in quiz:
        fail("抽问卡须把 connection 传给 PairedContent")

    raw = (
        "用法1: 動詞辞書形 + ことがある。"
        "用法2: 動詞た形 + ことがある。"
        "否定形: ことがない / ことはない。"
    )
    got = expand_breaks(raw)
    lines = [ln.strip() for ln in got.split("\n") if ln.strip()]
    if len(lines) < 3:
        fail(f"用法1/用法2/否定形 应拆成多行，得到 {lines!r}")
    if not lines[0].startswith("用法1"):
        fail(f"第一行应为用法1: {lines[0]!r}")
    if not any(ln.startswith("用法2") for ln in lines):
        fail("须含用法2行")

    print("OK: connection inline under usage")
    print("All jp-vocab connection-inline-with-usage checks passed.")


if __name__ == "__main__":
    main()
