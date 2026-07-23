#!/usr/bin/env python3
"""Regression: teacher card shows romanization; student hides speak/reading; both have edit."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> int:
    print(f"[check_ko_pron_flashcard_teacher_student] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    teacher = (
        ROOT / "src/components/KoPronTeacherQuizFlashcardModal.tsx"
    ).read_text(encoding="utf-8")
    study = (ROOT / "src/components/KoPronStudyPage.tsx").read_text(encoding="utf-8")
    edit = (ROOT / "src/components/KoPronEditModal.tsx").read_text(encoding="utf-8")
    route = (ROOT / "src/app/api/ko-pron/route.ts").read_text(encoding="utf-8")
    db = (ROOT / "src/lib/ko-pron-db.ts").read_text(encoding="utf-8")

    if '显示读音</' in teacher or ">显示读音<" in teacher:
        return fail("teacher card must not gate romanization behind 显示读音 button")
    if "罗马音 / 读法" not in teacher:
        return fail("teacher card must show 罗马音 label")
    if "onEdit" not in teacher or "编辑" not in teacher:
        return fail("teacher card missing 编辑")

    if "KoPronSpeakButton" in study:
        return fail("student study must hide speak button")
    if "reading_revealed" in study and "letter.reading" in study:
        # should not display reading value
        if "ko-pron-study-reading-value" in study or "罗马音 / 读法" in study:
            return fail("student study must hide romanization UI")
    if "编辑" not in study or "KoPronEditModal" not in study:
        return fail("student study missing 编辑")

    if "罗马音 / 读法" not in edit or "分类" not in edit:
        return fail("edit modal fields incomplete")
    if 'action: "edit"' not in edit:
        return fail("edit modal must POST action=edit")
    if 'action === "edit"' not in route:
        return fail("API missing edit action")
    if "updateKoPronLetter" not in db:
        return fail("db missing updateKoPronLetter")

    print("[check_ko_pron_flashcard_teacher_student] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
