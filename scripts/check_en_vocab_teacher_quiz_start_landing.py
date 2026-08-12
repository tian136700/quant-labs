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
    if "pendingWords" not in start:
        fail("start panel must accept pendingWords for left preview list")
    if "本轮待抽" not in start:
        fail("start panel must show 本轮待抽 list title")
    if "grid-template-columns" not in start:
        fail("start panel must use two-column grid (list + start)")
    if "pointer-events: none" not in start:
        fail("pending list rows must be non-interactive (pointer-events: none)")
    # UI copy only — comments may mention the forbidden pattern
    if "（今日目标" in start or "今日目标 {" in start:
        fail("start panel must not show 今日目标 (only remaining round count)")
    if "quizTarget" in start:
        fail("start panel must not take quizTarget prop")

    word_list = WORD_LIST.read_text(encoding="utf-8")
    if "EnVocabTeacherQuizStartPanel" not in word_list:
        fail("EnVocabPageWordList must render EnVocabTeacherQuizStartPanel")
    if "showTeacherQuizStartLanding" not in word_list:
        fail("EnVocabPageWordList must branch on showTeacherQuizStartLanding")
    if "pendingWords={pendingQuizWords}" not in word_list:
        fail("EnVocabPageWordList must pass pendingQuizWords to StartPanel")
    hide_branch = word_list.split("hideTeacherQuizList ?", 1)
    if len(hide_branch) < 2:
        fail("EnVocabPageWordList must gate on hideTeacherQuizList")
    landing_chunk = hide_branch[1].split(") : (", 1)[0]
    if "EnVocabWordTable" in landing_chunk:
        fail("start landing branch must not render EnVocabWordTable")

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
    if "pendingQuizWords={pendingQuizWords}" not in page:
        fail("EnVocabPage must pass pendingQuizWords to WordList")

    toolbar = TOOLBAR.read_text(encoding="utf-8")
    if "hideStartQuizButton" not in toolbar:
        fail("EnVocabPageToolbar must support hideStartQuizButton")

    rule = RULE.read_text(encoding="utf-8")
    if "只读" not in rule and "pendingWords" not in rule:
        fail("start-landing rule must allow read-only pending preview list")
    if "EnVocabWordTable" not in rule:
        fail("start-landing rule must still forbid interactive WordTable")

    print("OK: en-vocab teacher quiz start landing hides list until start")


if __name__ == "__main__":
    main()
