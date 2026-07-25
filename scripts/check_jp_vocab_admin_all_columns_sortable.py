#!/usr/bin/env python3
"""Regression: /jp-vocab 与 /jp-vocab/admin 表头（除操作）均可排序。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "src/lib/jp-vocab-shared.ts"
TABLE = ROOT / "src/components/jp-vocab-page/JpVocabWordTable.tsx"
PAGE = ROOT / "src/components/JpVocabPage.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    shared = SHARED.read_text(encoding="utf-8")
    table = TABLE.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")

    type_block = shared.split("export type JpVocabStatSortKey")[1].split("export ")[0]
    for key in [
        "seq",
        "kind",
        "word",
        "reading",
        "meaning",
        "pos",
        "mnemonic",
        "level",
        "today",
        "notes",
        "risk",
        "very",
        "normal",
        "weak",
        "total",
    ]:
        if f'"{key}"' not in type_block:
            fail(f"jp-vocab-shared.ts JpVocabStatSortKey missing {key!r}")

    for key in [
        "seq",
        "kind",
        "word",
        "reading",
        "meaning",
        "pos",
        "mnemonic",
        "level",
        "today",
        "notes",
        "risk",
    ]:
        if f'sortKey="{key}"' not in table:
            fail(f"JpVocabWordTable missing sort button for {key!r}")

    if "操作" not in table:
        fail("action column must remain")
    if 'sortKey="action"' in table:
        fail("action column must not be sortable")

    if "dailySeqByWordId" not in page:
        fail("JpVocabPage must use dailySeqByWordId")
    # 调用处：sortJpVocabWordsForDisplay(..., { timeWeight, dailySeqByWordId })
    call_idx = page.find("sortJpVocabWordsForDisplay(words, statSort,")
    if call_idx < 0:
        fail("JpVocabPage missing sortJpVocabWordsForDisplay(words, statSort, …)")
    call_snip = page[call_idx : call_idx + 280]
    if "dailySeqByWordId" not in call_snip:
        fail("JpVocabPage must pass dailySeqByWordId into sortJpVocabWordsForDisplay")

    print("OK: jp-vocab all data columns sortable")


if __name__ == "__main__":
    main()
