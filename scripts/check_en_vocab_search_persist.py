#!/usr/bin/env python3
"""Regression: 英语抽背搜索关键词刷新后保留，最近搜索下拉，有关键词强制拉最新。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONSTANTS = ROOT / "src/lib/en-vocab-page-constants.ts"
HELPERS = ROOT / "src/lib/en-vocab-page-helpers.tsx"
PAGE = ROOT / "src/components/EnVocabPage.tsx"
SEARCH = ROOT / "src/components/en-vocab-page/EnVocabPageSearch.tsx"
STYLES = ROOT / "src/components/en-vocab-page/EnVocabPageStylesLayout.tsx"
FRESH_HOOK = ROOT / "src/hooks/useEnVocabSearchFreshLoad.ts"
SWR = ROOT / "src/lib/client-swr-cache.ts"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    constants = CONSTANTS.read_text(encoding="utf-8")
    helpers = HELPERS.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    search = SEARCH.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")
    fresh_hook = FRESH_HOOK.read_text(encoding="utf-8")
    swr = SWR.read_text(encoding="utf-8")

    for needle in [
        'EN_VOCAB_SEARCH_QUERY_STORAGE_KEY = "en_vocab_search_query"',
        'EN_VOCAB_SEARCH_KIND_STORAGE_KEY = "en_vocab_search_kind"',
        'EN_VOCAB_SEARCH_HISTORY_STORAGE_KEY = "en_vocab_search_history"',
        "EN_VOCAB_SEARCH_HISTORY_MAX = 8",
        "EN_VOCAB_SEARCH_FRESH_DEBOUNCE_MS",
    ]:
        if needle not in constants:
            fail(f"constants missing {needle}")

    for needle in [
        "export function readStoredEnVocabSearchQuery",
        "export function writeStoredEnVocabSearchQuery",
        "export function readStoredEnVocabKindFilter",
        "export function writeStoredEnVocabKindFilter",
        "export function readStoredEnVocabSearchHistory",
        "export function pushEnVocabSearchHistory",
        "export function clearEnVocabSearchHistory",
        "export function removeEnVocabSearchHistoryItem",
    ]:
        if needle not in helpers:
            fail(f"helpers missing {needle}")

    if "readStoredEnVocabSearchQuery()" not in page:
        fail("EnVocabPage must init searchQuery from localStorage")
    if "readStoredEnVocabKindFilter()" not in page:
        fail("EnVocabPage must init kindFilter from localStorage")
    if "useEnVocabSearchFreshLoad(searchQuery, loadWords)" not in page:
        fail("EnVocabPage must call useEnVocabSearchFreshLoad(searchQuery, loadWords)")

    for needle in [
        "writeStoredEnVocabSearchQuery",
        "pushEnVocabSearchHistory",
        "jp-vocab-search__history",
        "最近搜索",
        "清除记录",
        "handlePickHistory",
        "搜索全库；有关键词时自动拉最新",
    ]:
        if needle not in search:
            fail(f"EnVocabPageSearch missing {needle}")

    if "jp-vocab-search__input-wrap" not in styles:
        fail("styles missing search input wrap / history dropdown")
    if "jp-vocab-search__history" not in styles:
        fail("styles missing history panel")

    for needle in [
        "loadWords({ force: true })",
        "EN_VOCAB_SEARCH_FRESH_DEBOUNCE_MS",
        "searchQuery.trim()",
    ]:
        if needle not in fresh_hook:
            fail(f"useEnVocabSearchFreshLoad missing {needle}")

    if 'cache: "no-store"' not in swr:
        fail("fetchWithClientCache must use cache: no-store so force bypasses HTTP cache")

    print("OK: en-vocab search persist + recent history + fresh-on-search")


if __name__ == "__main__":
    main()
