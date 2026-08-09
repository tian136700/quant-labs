#!/usr/bin/env python3
"""Regression: en-vocab 全库列表 / sync 禁止扫大字段正文（易 1102）。"""

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
    route = (ROOT / "src/app/api/en-vocab/route.ts").read_text(encoding="utf-8")
    content_lib = (ROOT / "src/lib/en-vocab-word-content.ts").read_text(
        encoding="utf-8"
    )

    if "WORD_SELECT_LIST" not in helpers:
        fail("helpers.ts must define WORD_SELECT_LIST")
    list_block = helpers.split("export const WORD_SELECT_LIST", 1)[1].split(
        "export function refsRecord", 1
    )[0]
    if "has_class_notes" not in list_block:
        fail("WORD_SELECT_LIST must use has_class_notes instead of class_notes")
    if "has_usage" not in list_block or "has_example_sentences" not in list_block:
        fail("WORD_SELECT_LIST must expose has_usage / has_example_sentences flags")
    if "has_connection" not in list_block:
        fail("WORD_SELECT_LIST must expose has_connection flag")

    stripped = (
        list_block.replace("has_class_notes", "")
        .replace("class_notes IS NOT NULL", "")
        .replace("has_usage", "")
        .replace("usage IS NOT NULL", "")
        .replace("has_example_sentences", "")
        .replace("example_sentences IS NOT NULL", "")
        .replace("has_connection", "")
        .replace("connection IS NOT NULL", "")
    )
    for blob in ("class_notes", "usage_source", "example_sentences_source", "connection_source"):
        if blob in stripped:
            fail(f"WORD_SELECT_LIST must not SELECT {blob} body/source")
    # bare usage / example_sentences / connection as selected columns (not only in CASE)
    for col in ("usage,", "example_sentences,", "connection,"):
        if col in stripped.replace(" ", ""):
            fail(f"WORD_SELECT_LIST must not SELECT {col.rstrip(',')} body")

    if "listEnVocabWordsForClientList" not in words:
        fail("words.ts must define listEnVocabWordsForClientList")
    if "WORD_SELECT_LIST" not in words:
        fail("listEnVocabWords* must use WORD_SELECT_LIST")
    if "mapEnVocabListWordRow" not in words:
        fail("listEnVocabWords must map with mapEnVocabListWordRow")
    if "stripEnVocabWordNotesForList" not in words:
        fail("dev list must strip blobs via stripEnVocabWordNotesForList")

    if "mergeEnVocabWordSyncPatch" not in sync:
        fail("mergeEnVocabSyncPatches must preserve class_notes when patch omits body")
    if "class_notes_present" not in sync:
        fail("sync merge must respect class_notes_present")
    if "usage_present" not in sync:
        fail("sync merge must preserve usage when list patch omits body")

    if "hasEnVocabClassNotes" not in table:
        fail("EnVocabWordTable must use hasEnVocabClassNotes for 备注列")
    if "contentPresent" not in table and "usage_present" not in table:
        fail("EnVocabWordTable must pass usage_present for 用法/例句列")

    if "word_id" not in route or "getEnVocabWordByIdLite" not in route:
        fail("GET /api/en-vocab must support word_id detail via getEnVocabWordByIdLite")
    if "enVocabWordNeedsContentBlobFetch" not in content_lib:
        fail("en-vocab-word-content.ts must detect when to fetch omitted blobs")

    print("OK: en-vocab list/sync omit notes/usage/examples/connection blobs (1102 guard)")


if __name__ == "__main__":
    main()
