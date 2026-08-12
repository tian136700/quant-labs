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
    if "JpVocabTeacherQuizStartPanel" not in word_list:
        fail("JpVocabPageWordList must render JpVocabTeacherQuizStartPanel")
    if "showTeacherQuizStartLanding" not in word_list:
        fail("JpVocabPageWordList must branch on showTeacherQuizStartLanding")
    if "JpVocabTeacherQuizResumePanel" not in word_list:
        fail("JpVocabPageWordList must keep ResumePanel for in-progress")
    if "pendingWords={props.pendingQuizWords" not in word_list:
        fail("JpVocabPageWordList must pass pendingQuizWords to StartPanel")
    # Start landing branch must not render the interactive table
    hide_branch = word_list.split("if (props.hideTeacherQuizList)", 1)
    if len(hide_branch) < 2:
        fail("JpVocabPageWordList must gate on hideTeacherQuizList")
    hide_body = hide_branch[1].split("return (", 2)[1] if "return (" in hide_branch[1] else hide_branch[1]
    # First return under hideTeacherQuizList is the landing/resume branch
    first_return = hide_branch[1]
    end_hide = first_return.find("\n  return (")
    landing_chunk = first_return if end_hide < 0 else first_return[:end_hide]
    if "JpVocabWordTable" in landing_chunk:
        fail("start landing branch must not render JpVocabWordTable")

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
    if "pendingQuizWords={pendingQuizWords}" not in page:
        fail("JpVocabPage must pass pendingQuizWords to WordList")
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

    rule = RULE.read_text(encoding="utf-8")
    if "只读" not in rule and "pendingWords" not in rule:
        fail("start-landing rule must allow read-only pending preview list")
    if "JpVocabWordTable" not in rule:
        fail("start-landing rule must still forbid interactive WordTable")

    print("OK: jp-vocab teacher quiz start landing hides list until start")


if __name__ == "__main__":
    main()
