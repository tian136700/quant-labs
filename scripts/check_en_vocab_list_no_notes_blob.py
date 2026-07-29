#!/usr/bin/env python3
"""Regression: en-vocab 全库列表 / sync 禁止 SELECT class_notes 正文（易 1102）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    helpers = (ROOT / "src/lib/en-vocab-db/helpers.ts").read_text(encoding="utf-8")
    words = (ROOT / "src/lib/en-vocab-db/words.ts").read_text(encoding="utf-8")
    sync = (ROOT / "src/lib/en-vocab-sync.ts").read_text(encoding="utf-8")
    table = (
        ROOT / "src/components/en-vocab-page/EnVocabWordTable.tsx"
    ).read_text(encoding="utf-8")

    if "WORD_SELECT_LIST" not in helpers:
        fail("helpers.ts must define WORD_SELECT_LIST")
    list_block = helpers.split("export const WORD_SELECT_LIST", 1)[1].split(
        "export function refsRecord", 1
    )[0]
    if "has_class_notes" not in list_block:
        fail("WORD_SELECT_LIST must use has_class_notes instead of class_notes")
    stripped = list_block.replace("has_class_notes", "").replace(
        "class_notes IS NOT NULL", ""
    )
    if "class_notes" in stripped:
        fail("WORD_SELECT_LIST must not SELECT class_notes column body")

    if "WORD_SELECT_LIST" not in words:
        fail("listEnVocabWords must use WORD_SELECT_LIST")
    if "mapEnVocabListWordRow" not in words:
        fail("listEnVocabWords must map with mapEnVocabListWordRow")
    if "stripEnVocabWordNotesForList" not in words:
        fail("dev list must strip class_notes via stripEnVocabWordNotesForList")

    if "mergeEnVocabWordSyncPatch" not in sync:
        fail("mergeEnVocabSyncPatches must preserve class_notes when patch omits body")
    if "class_notes_present" not in sync:
        fail("sync merge must respect class_notes_present")

    if "hasEnVocabClassNotes" not in table:
        fail("EnVocabWordTable must use hasEnVocabClassNotes for 备注列")

    print("OK: en-vocab list/sync omit class_notes blob (1102 guard)")


if __name__ == "__main__":
    main()
