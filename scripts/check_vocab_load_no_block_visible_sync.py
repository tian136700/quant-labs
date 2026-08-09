#!/usr/bin/env python3
"""Regression: vocab loadWords must not await teacher-visible before clearing loading."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SYNC_FILES = [
    ROOT / "src/hooks/useJpVocabPageSync.ts",
    ROOT / "src/hooks/useEnVocabPageSync.ts",
]

WORD_LIST_FILES = [
    ROOT / "src/components/jp-vocab-page/JpVocabPageWordList.tsx",
    ROOT / "src/components/en-vocab-page/EnVocabPageWordList.tsx",
]

SWR = ROOT / "src/lib/client-swr-cache.ts"


def fail(msg: str) -> None:
    print(f"[check_vocab_load_no_block_visible_sync] FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    for path in SYNC_FILES:
        text = path.read_text(encoding="utf-8")
        if re.search(r"await\s+visibleSync\b", text):
            fail(f"{path.relative_to(ROOT)}: must not await visibleSync (blocks loading)")
        if "void syncTeacherVisibleLimitFromServer()" not in text:
            fail(
                f"{path.relative_to(ROOT)}: loadWords must fire teacher-visible with void …()"
            )
        if "AbortSignal.timeout(15_000)" not in text:
            fail(f"{path.relative_to(ROOT)}: teacher-visible fetch needs 15s timeout")

    for path in WORD_LIST_FILES:
        text = path.read_text(encoding="utf-8")
        if "loading && !wordsLength" not in text and "loading && !props.wordsLength" not in text:
            fail(
                f"{path.relative_to(ROOT)}: show table when words already loaded "
                "(loading && !wordsLength gate)"
            )

    swr = SWR.read_text(encoding="utf-8")
    if "AbortSignal.timeout" not in swr:
        fail("client-swr-cache.ts: fetch must use AbortSignal.timeout")
    if "if (!res.ok)" not in swr:
        fail("client-swr-cache.ts: must check !res.ok before parse")
    if "1102" not in swr:
        fail("client-swr-cache.ts: must map Worker 1102 to a user-facing error")

    print("[check_vocab_load_no_block_visible_sync] OK")


if __name__ == "__main__":
    main()
