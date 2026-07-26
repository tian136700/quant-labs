#!/usr/bin/env python3
"""Regression: 日语抽问搜索关键词刷新后保留，并有最近搜索下拉。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONSTANTS = ROOT / "src/lib/jp-vocab-page-constants.ts"
HELPERS = ROOT / "src/lib/jp-vocab-page-helpers.ts"
PAGE = ROOT / "src/components/JpVocabPage.tsx"
SEARCH = ROOT / "src/components/jp-vocab-page/JpVocabPageSearch.tsx"
STYLES = ROOT / "src/components/jp-vocab-page/JpVocabPageStylesLayout.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    constants = CONSTANTS.read_text(encoding="utf-8")
    helpers = HELPERS.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    search = SEARCH.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")

    for needle in [
        'JP_VOCAB_SEARCH_QUERY_STORAGE_KEY = "jp_vocab_search_query"',
        'JP_VOCAB_SEARCH_KIND_STORAGE_KEY = "jp_vocab_search_kind"',
        'JP_VOCAB_SEARCH_HISTORY_STORAGE_KEY = "jp_vocab_search_history"',
        "JP_VOCAB_SEARCH_HISTORY_MAX = 8",
    ]:
        if needle not in constants:
            fail(f"constants missing {needle}")

    for needle in [
        "export function readStoredJpVocabSearchQuery",
        "export function writeStoredJpVocabSearchQuery",
        "export function readStoredJpVocabKindFilter",
        "export function writeStoredJpVocabKindFilter",
        "export function readStoredJpVocabSearchHistory",
        "export function pushJpVocabSearchHistory",
        "export function clearJpVocabSearchHistory",
        "export function removeJpVocabSearchHistoryItem",
    ]:
        if needle not in helpers:
            fail(f"helpers missing {needle}")

    if "readStoredJpVocabSearchQuery()" not in page:
        fail("JpVocabPage must init searchQuery from localStorage")
    if "readStoredJpVocabKindFilter()" not in page:
        fail("JpVocabPage must init kindFilter from localStorage")
    if 'useState("")' in page and "searchQuery" in page.split('useState("")')[0][-80:]:
        # soft: empty init is OK only if not for searchQuery — already checked above
        pass

    for needle in [
        "writeStoredJpVocabSearchQuery",
        "pushJpVocabSearchHistory",
        "jp-vocab-search__history",
        "最近搜索",
        "清除记录",
        "handlePickHistory",
    ]:
        if needle not in search:
            fail(f"JpVocabPageSearch missing {needle}")

    if "jp-vocab-search__input-wrap" not in styles:
        fail("styles missing search input wrap / history dropdown")
    if "jp-vocab-search__history" not in styles:
        fail("styles missing history panel")

    print("OK: jp-vocab search persist + recent history")


if __name__ == "__main__":
    main()
