#!/usr/bin/env python3
"""Regression: JP teacher quiz shares to student on「下一个」, not on level check."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def must_contain(path: str, needle: str, label: str) -> None:
    text = read(path)
    if needle not in text:
        raise AssertionError(f"{label}: missing in {path}: {needle!r}")


def must_not_contain(path: str, needle: str, label: str) -> None:
    text = read(path)
    if needle in text:
        raise AssertionError(f"{label}: must not appear in {path}: {needle!r}")


def main() -> int:
    # Level POST must not auto-share
    route = read("src/app/api/jp-vocab/route.ts")
    if "shareToStudy: true" in route and "word_id" in route:
        # Allow true only if clearly not the level review path; require false near recordJpVocabReview
        if "shareToStudy: false" not in route:
            raise AssertionError(
                "jp-vocab route: record level must use shareToStudy: false"
            )
    must_contain(
        "src/app/api/jp-vocab/route.ts",
        "shareToStudy: false",
        "level review no auto-share",
    )

    must_contain(
        "src/hooks/useJpVocabReviewActions.ts",
        "ensureWordSharedBeforeNext",
        "share-before-next helper",
    )
    must_contain(
        "src/hooks/useJpVocabReviewActions.ts",
        "正在同步该单词给学生，请稍等",
        "share progress status",
    )
    must_not_contain(
        "src/hooks/useJpVocabReviewActions.ts",
        "已勾选熟悉程度，并同步到学生",
        "no share-on-check status",
    )

    must_contain(
        "src/components/jp-vocab-teacher-quiz-flashcard/useJpVocabTeacherQuizNextAdvance.ts",
        "onEnsureSharedBeforeNext",
        "next advance waits for share",
    )
    must_contain(
        "src/components/jp-vocab-teacher-quiz-flashcard/helpers.ts",
        "JP_VOCAB_SYNC_ON_NEXT_PROGRESS_LABEL",
        "progress label constant",
    )
    must_contain(
        "src/components/JpVocabTeacherQuizFlashcardModal.tsx",
        "onEnsureSharedBeforeNext",
        "flashcard wires ensure shared",
    )
    must_contain(
        "src/components/JpVocabTeacherQuizIntroModal.tsx",
        "点「下一个」时才会把该词同步",
        "intro explains share-on-next",
    )

    print("OK: jp-vocab share-on-next guards")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as err:
        print(f"FAIL: {err}", file=sys.stderr)
        raise SystemExit(1)
