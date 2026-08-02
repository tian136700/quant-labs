#!/usr/bin/env python3
"""Regression: 管理员预览抽问卡顶栏须展示词库 ID。

对照：
- JpVocabFlashcardHeader showAdminWordId + wordId
- EnVocabFlashcardPageHeader 同逻辑
不调模型。
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JP_HEADER = ROOT / "src/components/jp-vocab-teacher-quiz-flashcard/JpVocabFlashcardHeader.tsx"
JP_MODAL = ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
EN_HEADER = ROOT / "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageHeader.tsx"
EN_MODAL = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    jp_h = JP_HEADER.read_text(encoding="utf-8")
    jp_m = JP_MODAL.read_text(encoding="utf-8")
    en_h = EN_HEADER.read_text(encoding="utf-8")
    en_m = EN_MODAL.read_text(encoding="utf-8")

    if "showAdminWordId" not in jp_h or "ID {wordId}" not in jp_h:
        fail("JpVocabFlashcardHeader must show admin preview word ID")
    if "wordId={w.id}" not in jp_m:
        fail("JpVocabTeacherQuizFlashcardModal must pass wordId={w.id}")

    if "showAdminWordId" not in en_h or "ID {wordId}" not in en_h:
        fail("EnVocabFlashcardPageHeader must show admin preview word ID")
    if "wordId={w.id}" not in en_m:
        fail("EnVocabTeacherQuizFlashcardModal must pass wordId={w.id}")

    # 仅管理员预览：不要在老师抽查常驻顶栏硬塞 ID
    if "previewMode && !isCoach && !isStudy" not in jp_h:
        fail("JP word ID must be gated to admin preview (previewMode && !isCoach && !isStudy)")
    if "previewMode && !isStudy" not in en_h:
        fail("EN word ID must be gated to admin preview (previewMode && !isStudy)")

    print("ok: admin preview flashcard shows word ID (jp+en)")


if __name__ == "__main__":
    main()
