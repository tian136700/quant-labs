#!/usr/bin/env python3
"""Regression: gloss lines must be「译文：」+ Chinese, never「译文：/ …」or stacked labels.

Mirrors stripJpVocabExampleGlossLabel / formatJpVocabExampleGlossLine.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "lib" / "jp-vocab-example-sentences.ts"

GLOSS_LABEL = "译文："
GLOSS_LABEL_RE = re.compile(r"^(译文|翻譯|翻译|译|譯|訳文|訳)\s*[:：]\s*")
LEADING_SLASH_RE = re.compile(r"^[\s／/]+")

CASES = [
    ("译文：请按左边的按钮。", "译文：请按左边的按钮。"),
    ("译文：/ 请按左边的按钮。", "译文：请按左边的按钮。"),
    ("译文：／请按左边的按钮。", "译文：请按左边的按钮。"),
    ("译文：/ 译文：这是一个重要的问题。", "译文：这是一个重要的问题。"),
    ("译文：訳文：今天非常冷。", "译文：今天非常冷。"),
    ("訳文：作业多得很，我很头疼。", "译文：作业多得很，我很头疼。"),
    ("/ 右的相反是左。", "译文：右的相反是左。"),
    ("译：/他用左手画画。", "译文：他用左手画画。"),
    ("译文：", ""),
    ("/", ""),
]


def format_gloss(text: str) -> str:
    body = (text or "").strip()
    for _ in range(8):
        nxt = GLOSS_LABEL_RE.sub("", body)
        nxt = LEADING_SLASH_RE.sub("", nxt).strip()
        if nxt == body:
            break
        body = nxt
    return f"{GLOSS_LABEL}{body}" if body else ""


def main() -> int:
    src = SRC.read_text(encoding="utf-8")
    if "／/" not in src or "for (let i = 0; i < 8; i++)" not in src:
        print(
            "[check_jp_vocab_example_gloss] FAIL: "
            "jp-vocab-example-sentences.ts missing loop strip for /／ + 译文：",
            file=sys.stderr,
        )
        return 1
    if "訳文" not in src:
        print(
            "[check_jp_vocab_example_gloss] FAIL: "
            "GLOSS_LABEL_RE must strip Japanese 訳文： stacked labels",
            file=sys.stderr,
        )
        return 1

    for raw, expected in CASES:
        got = format_gloss(raw)
        if got != expected:
            print(
                "[check_jp_vocab_example_gloss] FAIL:\n"
                f"  raw:      {raw!r}\n"
                f"  got:      {got!r}\n"
                f"  expected: {expected!r}",
                file=sys.stderr,
            )
            return 1

    print(f"[check_jp_vocab_example_gloss] OK ({len(CASES)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
