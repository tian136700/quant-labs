#!/usr/bin/env python3
"""Regression: /en-vocab/admin table headers (except select/action) are sortable."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "src/lib/en-vocab-shared.ts"
TABLE = ROOT / "src/components/en-vocab-page/EnVocabWordTable.tsx"
PAGE = ROOT / "src/components/EnVocabPage.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    shared = SHARED.read_text(encoding="utf-8")
    table = TABLE.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")

    for key in [
        "seq",
        "kind",
        "word",
        "reading",
        "meaning",
        "pos",
        "usage",
        "mnemonic",
        "level",
        "today",
        "notes",
        "risk",
        "updated",
        "very",
        "normal",
        "weak",
        "total",
    ]:
        if f'| "{key}"' not in shared and f'| "{key}"' not in shared.replace(
            "| ", "|"
        ):
            # type union uses | "key"
            if f'"{key}"' not in shared.split("export type EnVocabStatSortKey")[1].split(
                "export "
            )[0]:
                fail(f"en-vocab-shared.ts EnVocabStatSortKey missing {key!r}")

    for key in [
        "seq",
        "kind",
        "word",
        "reading",
        "meaning",
        "pos",
        "usage",
        "mnemonic",
        "level",
        "today",
        "notes",
        "risk",
        "updated",
    ]:
        if f'sortKey="{key}"' not in table:
            fail(f"EnVocabWordTable missing sort button for {key!r}")

    if "操作" not in table:
        fail("action column must remain")
    # 操作列本身不应变成 sortKey
    if 'sortKey="action"' in table:
        fail("action column must not be sortable")

    if "dailySeqByWordId" not in page or "sortEnVocabWordsForDisplay(words, statSort, { dailySeqByWordId })" not in page:
        fail("EnVocabPage must pass dailySeqByWordId into sortEnVocabWordsForDisplay")

    print("OK: en-vocab admin all data columns sortable")


if __name__ == "__main__":
    main()
