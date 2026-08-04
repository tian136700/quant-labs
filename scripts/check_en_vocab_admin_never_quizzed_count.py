#!/usr/bin/env python3
"""Regression: /en-vocab/admin toolbar must show never-quizzed count (align jp-vocab).

Fails if English admin toolbar drops 「从未抽查」 or stops wiring neverQuizzedCount.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    page = read("src/components/EnVocabPage.tsx")
    toolbar = read("src/components/en-vocab-page/EnVocabPageToolbar.tsx")
    styles = read("src/components/en-vocab-page/EnVocabPageStylesLayout.tsx")

    if "enVocabTotalReviews" not in page:
        fail("EnVocabPage must import/use enVocabTotalReviews for never-quizzed count")
    if "neverQuizzedCount" not in page:
        fail("EnVocabPage must compute neverQuizzedCount")
    if "neverQuizzedCount={neverQuizzedCount}" not in page:
        fail("EnVocabPage must pass neverQuizzedCount to EnVocabPageToolbar")
    if "isAdminMode ? words.filter((w) => enVocabTotalReviews(w) === 0).length : 0" not in page:
        fail("neverQuizzedCount must count admin words with enVocabTotalReviews===0 only")

    if "neverQuizzedCount: number" not in toolbar:
        fail("EnVocabPageToolbar props must include neverQuizzedCount")
    if "从未抽查" not in toolbar:
        fail("EnVocabPageToolbar admin summary must show 从未抽查")
    if "jp-vocab-today-summary-value--never" not in toolbar:
        fail("never-quizzed count must use --never highlight class when > 0")
    if "isAdminMode ?" not in toolbar or "本轮未勾选" not in toolbar:
        fail("toolbar must keep admin vs teacher summary split")

    if "jp-vocab-today-summary-value--never" not in styles:
        fail("EnVocabPageStylesLayout must define --never summary color (align jp)")

    print("OK: en-vocab admin never-quizzed toolbar count")


if __name__ == "__main__":
    main()
