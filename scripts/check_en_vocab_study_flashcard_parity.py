#!/usr/bin/env python3
"""Regression: /en-vocab/study must open EnVocabTeacherQuizFlashcardModal in study mode + peek."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STUDY = ROOT / "src/components/EnVocabStudyPage.tsx"
TEACHER = ROOT / "src/components/EnVocabPage.tsx"
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    study = STUDY.read_text(encoding="utf-8")
    teacher = TEACHER.read_text(encoding="utf-8")
    modal = MODAL.read_text(encoding="utf-8")

    if "EnVocabTeacherQuizFlashcardModal" not in study:
        fail("EnVocabStudyPage must use EnVocabTeacherQuizFlashcardModal")
    if 'mode="study"' not in study and "mode={'study'}" not in study:
        fail('EnVocabStudyPage flashcard must use mode="study"')
    if "peekTeacherQuizWord" not in study:
        fail("EnVocabStudyPage missing peekTeacherQuizWord")
    if "/api/en-vocab/teacher-quiz-live" not in study:
        fail("EnVocabStudyPage must call /api/en-vocab/teacher-quiz-live")
    if "openStudyFlashcard" not in study:
        fail("EnVocabStudyPage must open flashcard from list click (openStudyFlashcard)")
    if "pendingFlashcardWordIdRef" not in study:
        fail("EnVocabStudyPage must auto-open on new shared words")
    if ".scrollIntoView(" in study:
        fail("EnVocabStudyPage must not scrollIntoView on flashcard open")

    if "studentPeekedCurrentWord" not in teacher:
        fail("EnVocabPage missing studentPeekedCurrentWord")
    if "studentPeeked={studentPeekedCurrentWord}" not in teacher:
        fail("EnVocabPage must pass studentPeeked to flashcard modal")

    if 'mode?: "quiz" | "study"' not in modal and 'mode?: "quiz" | "study"' not in modal.replace(
        " ", ""
    ):
        # keep soft: just ensure isStudy / mode === "study" exists
        if 'mode === "study"' not in modal and "isStudyMode" not in modal:
            fail("EnVocabTeacherQuizFlashcardModal must support mode=study")
    if "该学生已查看该单词" not in modal:
        fail("EnVocabTeacherQuizFlashcardModal missing student-peeked banner copy")
    if "jp-vocab-teacher-quiz__student-peek-banner" not in modal:
        fail("peek banner must sit in card header (student-peek-banner), not only scroll body")
    if "setStudentPeekedCurrentWord(true)" not in teacher:
        fail("EnVocabPage must latch studentPeeked=true until next word")
    if "setStudentPeekedCurrentWord(peeked)" in teacher:
        fail("EnVocabPage must not overwrite peek latch with poll false")

    if "TeacherReviewAuth" not in teacher:
        fail("EnVocabPage must require login via TeacherReviewAuth (no anonymous browse)")
    if "请登录后继续访问英语抽背" not in teacher:
        fail("EnVocabPage login gate missing copy")

    print("OK: en-vocab study flashcard / peek parity")


if __name__ == "__main__":
    main()
