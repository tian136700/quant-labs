#!/usr/bin/env python3
"""Regression: JP teacher quiz hides word list until Start; shows start landing."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

START = ROOT / "src/components/jp-vocab-page/JpVocabTeacherQuizStartPanel.tsx"
WORD_LIST = ROOT / "src/components/jp-vocab-page/JpVocabPageWordList.tsx"
PAGE = ROOT / "src/components/JpVocabPage.tsx"
LANDING = ROOT / "src/lib/jp-vocab-teacher-quiz-landing.ts"
GATE = ROOT / "src/hooks/useJpVocabTeacherQuizListGate.ts"
TOOLBAR = ROOT / "src/components/jp-vocab-page/JpVocabPageToolbar.tsx"
RULE = ROOT / ".cursor/rules/jp-vocab-teacher-quiz-start-landing.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (START, WORD_LIST, PAGE, LANDING, GATE, TOOLBAR, RULE):
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
    if "JpVocabTeacherQuizStartPanel" not in word_list:
        fail("JpVocabPageWordList must render JpVocabTeacherQuizStartPanel")
    if "showTeacherQuizStartLanding" not in word_list:
        fail("JpVocabPageWordList must branch on showTeacherQuizStartLanding")
    if "JpVocabTeacherQuizResumePanel" not in word_list:
        fail("JpVocabPageWordList must keep ResumePanel for in-progress")

    landing = LANDING.read_text(encoding="utf-8")
    if "resolveJpVocabTeacherQuizListVisibility" not in landing:
        fail("landing helper must export resolveJpVocabTeacherQuizListVisibility")
    if "teacherQuizRoundOpen" not in landing:
        fail("landing helper must use teacherQuizRoundOpen (hide list before start)")

    gate = GATE.read_text(encoding="utf-8")
    if "resolveJpVocabTeacherQuizListVisibility" not in gate:
        fail("list gate hook must call resolveJpVocabTeacherQuizListVisibility")
    if "showTeacherQuizStartLanding" not in gate:
        fail("list gate hook must expose showTeacherQuizStartLanding")

    page = PAGE.read_text(encoding="utf-8")
    if "showTeacherQuizStartLanding" not in page:
        fail("JpVocabPage must wire showTeacherQuizStartLanding")
    if "useJpVocabTeacherQuizListGate" not in page:
        fail("JpVocabPage must use useJpVocabTeacherQuizListGate")
    if "hideStartQuizButton={showTeacherQuizStartLanding}" not in page:
        fail("JpVocabPage must hide toolbar Start while landing is shown")
    # Must not hide list only while in progress
    if (
        "teacherQuizInProgress &&\n    !dailyQuizProgress.complete"
        in page
        and "useJpVocabTeacherQuizListGate" not in page
    ):
        fail("hideTeacherQuizList must not depend only on teacherQuizInProgress")

    toolbar = TOOLBAR.read_text(encoding="utf-8")
    if "hideStartQuizButton" not in toolbar:
        fail("JpVocabPageToolbar must support hideStartQuizButton")

    print("OK: jp-vocab teacher quiz start landing hides list until start")


if __name__ == "__main__":
    main()
