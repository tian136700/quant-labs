#!/usr/bin/env python3
"""Regression: en-vocab table pagination must match jp-vocab (page size options + persist).

Fails if English regresses to:
- fixed PAGE_SIZE only (e.g. 100) with no 10/20/50/100 select
- showPagination gated on length > PAGE_SIZE (hide bar when single page)
- missing localStorage helpers for page / pageSize
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
    constants = read("src/lib/en-vocab-page-constants.ts")
    helpers = read("src/lib/en-vocab-page-helpers.tsx")
    page = read("src/components/EnVocabPage.tsx")
    pagination = read("src/components/en-vocab-page/EnVocabPagination.tsx")
    word_list = read("src/components/en-vocab-page/EnVocabPageWordList.tsx")
    styles = read("src/components/en-vocab-page/EnVocabPageStylesLayout.tsx")

    if "EN_VOCAB_PAGE_SIZE_OPTIONS" not in constants:
        fail("en-vocab-page-constants must export EN_VOCAB_PAGE_SIZE_OPTIONS")
    if "[10, 20, 50, 100]" not in constants.replace(" ", ""):
        # allow spaced form
        if "10, 20, 50, 100" not in constants:
            fail("EN_VOCAB_PAGE_SIZE_OPTIONS must be [10, 20, 50, 100]")
    if "export const EN_VOCAB_PAGE_SIZE = 20" not in constants:
        fail("EN_VOCAB_PAGE_SIZE default must be 20 (align jp-vocab)")
    if "EN_VOCAB_PAGE_SIZE_STORAGE_KEY" not in constants:
        fail("must define EN_VOCAB_PAGE_SIZE_STORAGE_KEY for localStorage")

    if "readStoredEnVocabPageSize" not in helpers:
        fail("en-vocab-page-helpers must export readStoredEnVocabPageSize")
    if "writeStoredEnVocabPageSize" not in helpers:
        fail("en-vocab-page-helpers must export writeStoredEnVocabPageSize")
    if "readStoredEnVocabPage" not in helpers:
        fail("en-vocab-page-helpers must export readStoredEnVocabPage")

    if "readStoredEnVocabPageSize" not in page:
        fail("EnVocabPage must init pageSize from readStoredEnVocabPageSize")
    if "handlePageSizeChange" not in page:
        fail("EnVocabPage must define handlePageSizeChange")
    if "onPageSizeChange={handlePageSizeChange}" not in page:
        fail("EnVocabPage must pass onPageSizeChange to word list")
    if "showPagination" in page:
        fail("EnVocabPage must not gate pagination with showPagination (align jp)")

    if "PageSizeSelect" not in pagination and "jp-vocab-pagination__size-select" not in pagination:
        fail("EnVocabPagination must render per-page size select")
    if "EN_VOCAB_PAGE_SIZE_OPTIONS" not in pagination:
        fail("EnVocabPagination must use EN_VOCAB_PAGE_SIZE_OPTIONS")
    if "show:" in pagination or "show ?" in pagination or "show }" in pagination:
        # prop `show` was the old gate
        if "show: boolean" in pagination or "show," in pagination.split("export function")[0]:
            fail("EnVocabPagination must not take show:boolean gate (use totalItems<=0)")
    if "if (totalItems <= 0) return null" not in pagination:
        fail("EnVocabPagination must hide only when totalItems <= 0")

    if "onPageSizeChange" not in word_list:
        fail("EnVocabPageWordList must accept/pass onPageSizeChange")
    if "pageSize={pageSize}" not in word_list:
        fail("EnVocabPageWordList must pass pageSize to EnVocabPagination")
    if "show={showPagination}" in word_list:
        fail("EnVocabPageWordList must not pass show={showPagination}")

    if ".jp-vocab-pagination__size-select" not in styles:
        fail("EnVocabPageStylesLayout must style jp-vocab-pagination__size-select")
    if ".jp-vocab-pagination__controls" not in styles:
        fail("EnVocabPageStylesLayout must style jp-vocab-pagination__controls")

    print("OK: en-vocab pagination matches jp-vocab (page size options + persist)")


if __name__ == "__main__":
    main()
