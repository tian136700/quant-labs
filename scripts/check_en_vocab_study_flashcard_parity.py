#!/usr/bin/env python3
"""Regression: /en-vocab/study must open EnVocabTeacherQuizFlashcardModal in study mode + peek."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STUDY = ROOT / "src/components/EnVocabStudyPage.tsx"
TEACHER = ROOT / "src/components/EnVocabPage.tsx"
TEACHER_DIR = ROOT / "src/components/en-vocab-page"
MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
MODAL_DIR = ROOT / "src/components/en-vocab-teacher-quiz-flashcard"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def read_bundle(page: Path, sibling: Path | None = None) -> str:
    parts = [page.read_text(encoding="utf-8")]
    if sibling is not None and sibling.is_dir():
        for f in sorted(sibling.glob("*.tsx")) + sorted(sibling.glob("*.ts")):
            parts.append(f.read_text(encoding="utf-8"))
    return "\n".join(parts)


def main() -> None:
    study = STUDY.read_text(encoding="utf-8")
    teacher = read_bundle(TEACHER, TEACHER_DIR)
    modal = read_bundle(MODAL, MODAL_DIR)

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
    if (
        "studentPeeked={studentPeekedCurrentWord}" not in teacher
        and "studentPeeked={props.studentPeekedCurrentWord}" not in teacher
    ):
        fail("EnVocabPage must pass studentPeeked to flashcard modal")

    if 'mode?: "quiz" | "study"' not in modal and 'mode?: "quiz" | "study"' not in modal.replace(
        " ", ""
    ):
        # keep soft: just ensure isStudy / mode === "study" exists
        if 'mode === "study"' not in modal and "isStudyMode" not in modal:
            fail("EnVocabTeacherQuizFlashcardModal must support mode=study")
    if "该学生已查看该单词" not in modal:
        fail("EnVocabTeacherQuizFlashcardModal/header missing student-peeked banner copy（该学生已查看该单词）")
    if "该学生已获取该单词" in modal:
        fail("peek banner must say 已查看 not 已获取")
    if "该单词已同步" not in modal:
        fail("EnVocabTeacherQuizFlashcardModal missing teacher-sync banner copy（该单词已同步）")
    if "jp-vocab-teacher-quiz__student-peek-banner" not in modal:
        fail("peek banner must sit in card header (student-peek-banner), not only scroll body")
    if "wordSynced" not in modal:
        fail("header must receive wordSynced (今日已共享 → 该单词已同步)")
    quiz_hook = (ROOT / "src/hooks/useEnVocabTeacherQuiz.ts").read_text(encoding="utf-8")
    peek_src = teacher + "\n" + quiz_hook
    if "setStudentPeekedCurrentWord(true)" not in peek_src:
        fail("EnVocabPage must latch studentPeeked=true until next word")
    if "setStudentPeekedCurrentWord(peeked)" in peek_src:
        fail("EnVocabPage must not overwrite peek latch with poll false")
    # 换词必须清闩锁（否则上一词 peek 误带到当前词）
    if "换词必须先清闩锁" not in quiz_hook and quiz_hook.count(
        "setStudentPeekedCurrentWord(false)"
    ) < 2:
        fail(
            "useEnVocabTeacherQuiz must clear peek latch on word change "
            "(setStudentPeekedCurrentWord(false) when entering a new quizFlashcardWordId)"
        )

    if "TeacherReviewAuth" not in teacher:
        fail("EnVocabPage must require login via TeacherReviewAuth (no anonymous browse)")
    if "请登录后继续访问英语抽背" not in teacher:
        fail("EnVocabPage login gate missing copy")

    print("OK: en-vocab study flashcard / peek parity")


if __name__ == "__main__":
    main()
