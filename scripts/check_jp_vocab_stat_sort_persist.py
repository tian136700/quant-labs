#!/usr/bin/env python3
"""Regression: 日语抽问表头排序刷新后 localStorage 恢复。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONSTANTS = ROOT / "src/lib/jp-vocab-page-constants.ts"
HELPERS = ROOT / "src/lib/jp-vocab-page-helpers.ts"
HOOK = ROOT / "src/hooks/useJpVocabPageStatSort.ts"
PAGE = ROOT / "src/components/JpVocabPage.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    constants = CONSTANTS.read_text(encoding="utf-8")
    helpers = HELPERS.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")

    if 'JP_VOCAB_STAT_SORT_STORAGE_KEY = "jp_vocab_stat_sort"' not in constants:
        fail("constants missing JP_VOCAB_STAT_SORT_STORAGE_KEY")

    for needle in [
        "export function readStoredJpVocabStatSort",
        "export function writeStoredJpVocabStatSort",
        "useDailyRowOrder",
        "JP_VOCAB_STAT_SORT_STORAGE_KEY",
    ]:
        if needle not in helpers:
            fail(f"helpers missing {needle}")

    for needle in [
        "readStoredJpVocabStatSort",
        "writeStoredJpVocabStatSort",
        "toggleStatSort",
        "restoreDailyRowOrder",
        "useDailyRowOrder",
    ]:
        if needle not in hook:
            fail(f"useJpVocabPageStatSort missing {needle}")

    if "useJpVocabPageStatSort(" not in page:
        fail("JpVocabPage must use useJpVocabPageStatSort")
    if "useState(() => JP_VOCAB_DEFAULT_STAT_SORT)" in page:
        fail("JpVocabPage must not hard-init statSort without storage")
    if "const [useDailyRowOrder, setUseDailyRowOrder] = useState(true)" in page:
        fail("JpVocabPage must not hard-init useDailyRowOrder without storage")

    print("OK: jp-vocab table sort persists across refresh")


if __name__ == "__main__":
    main()
