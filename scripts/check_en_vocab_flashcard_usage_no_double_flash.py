#!/usr/bin/env python3
"""Regression: en-vocab flashcard usage must not flash twice on open/preview.

Root cause was notes/content fetch wiping already-fetched usage via whole-word
onWordSaved replace, then re-fetching.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CONTENT_LIB = ROOT / "src/lib/en-vocab-word-content.ts"
CONTENT_HOOK = ROOT / "src/hooks/useEnVocabWordContentFetch.ts"
NOTES_HOOK = ROOT / "src/hooks/useEnVocabFlashcardClassNotesFetch.ts"
PAGE = ROOT / "src/components/EnVocabPage.tsx"
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
BODY = ROOT / "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageBody.tsx"
RULE = ROOT / ".cursor/rules/en-vocab-flashcard-usage-no-double-flash.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def must_contain(path: Path, needle: str, hint: str) -> None:
    if needle not in path.read_text(encoding="utf-8"):
        fail(f"{path.relative_to(ROOT)}: missing {hint} ({needle!r})")


def must_not_contain(path: Path, needle: str, hint: str) -> None:
    if needle in path.read_text(encoding="utf-8"):
        fail(f"{path.relative_to(ROOT)}: forbidden {hint} ({needle!r})")


def main() -> None:
    for path in (CONTENT_LIB, CONTENT_HOOK, NOTES_HOOK, PAGE, MODAL, BODY, RULE):
        if not path.is_file():
            fail(f"missing {path}")

    must_contain(
        CONTENT_LIB,
        "mergeEnVocabWordPreserveContentBlobs",
        "preserve-blobs merge helper",
    )
    must_contain(
        CONTENT_HOOK,
        "onWordUpdatedRef",
        "content fetch must not depend on unstable onWordUpdated",
    )
    must_contain(CONTENT_HOOK, "cacheRef", "session cache by word id")
    must_not_contain(
        CONTENT_HOOK,
        "onWordUpdated,\n    word,",
        "must not list whole word + onWordUpdated in fetch deps",
    )
    # loose check: fetch effect deps should not include bare `word` as last items
    hook = CONTENT_HOOK.read_text(encoding="utf-8")
    if "}, [\n    open,\n    word?.id," in hook and "\n    word,\n  ]);" in hook:
        fail("useEnVocabWordContentFetch must not put entire word in effect deps")

    must_contain(NOTES_HOOK, "onWordUpdatedRef", "notes fetch uses callback ref")
    must_contain(NOTES_HOOK, "wordRef.current", "notes merge must use latest wordRef")

    must_contain(
        PAGE,
        "mergeEnVocabWordPreserveContentBlobs",
        "handleWordSaved must preserve fetched usage blobs",
    )

    must_contain(MODAL, "contentLoading", "modal must track content loading")
    must_contain(BODY, "正在加载用法与例句", "body shows stable loading placeholder")

    must_contain(RULE, "闪两下", "rule names the symptom")
    print("OK: en-vocab flashcard usage no-double-flash guards passed.")


if __name__ == "__main__":
    main()
