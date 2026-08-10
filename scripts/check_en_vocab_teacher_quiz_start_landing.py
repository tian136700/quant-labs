#!/usr/bin/env python3
"""Regression: EN teacher quiz hides word list until Start; shows start landing."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

START = ROOT / "src/components/en-vocab-page/EnVocabTeacherQuizStartPanel.tsx"
WORD_LIST = ROOT / "src/components/en-vocab-page/EnVocabPageWordList.tsx"
PAGE = ROOT / "src/components/EnVocabPage.tsx"
TOOLBAR = ROOT / "src/components/en-vocab-page/EnVocabPageToolbar.tsx"
RULE = ROOT / ".cursor/rules/en-vocab-teacher-quiz-start-landing.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (START, WORD_LIST, PAGE, TOOLBAR, RULE):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    start = START.read_text(encoding="utf-8")
    if "本轮需要抽查" not in start:
        fail("start panel must show 本轮需要抽查 count")
    if "开始抽查" not in start:
        fail("start panel must have 开始抽查 button")
    if "加油" not in start:
        fail("start panel must include encouragement copy")
    if "ENCOURAGEMENTS" not in start:
        fail("start panel must keep rotating encouragement list")

    word_list = WORD_LIST.read_text(encoding="utf-8")
    if "EnVocabTeacherQuizStartPanel" not in word_list:
        fail("EnVocabPageWordList must render EnVocabTeacherQuizStartPanel")
    if "showTeacherQuizStartLanding" not in word_list:
        fail("EnVocabPageWordList must branch on showTeacherQuizStartLanding")

    page = PAGE.read_text(encoding="utf-8")
    if "showTeacherQuizStartLanding" not in page:
        fail("EnVocabPage must compute showTeacherQuizStartLanding")
    if "teacherQuizRoundOpen" not in page:
        fail("EnVocabPage must use teacherQuizRoundOpen (hide list before start)")
    # Must hide list for whole open round, not only while in progress
    if (
        "teacherQuizInProgress &&\n    !dailyQuizProgress.complete"
        in page
        and "teacherQuizRoundOpen" not in page
    ):
        fail("hideTeacherQuizList must not depend only on teacherQuizInProgress")
    if "hideStartQuizButton={showTeacherQuizStartLanding}" not in page:
        fail("EnVocabPage must hide toolbar Start while landing is shown")

    toolbar = TOOLBAR.read_text(encoding="utf-8")
    if "hideStartQuizButton" not in toolbar:
        fail("EnVocabPageToolbar must support hideStartQuizButton")

    print("OK: en-vocab teacher quiz start landing hides list until start")


if __name__ == "__main__":
    main()
