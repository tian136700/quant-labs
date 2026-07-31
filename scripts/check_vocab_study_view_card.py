#!/usr/bin/env python3
"""回归：今日日语/英语单词操作列须有「查看卡片」，打开老师同款抽问卡。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    jp_table = (
        ROOT / "src/components/jp-vocab-study-page/JpVocabStudyPageTable.tsx"
    ).read_text(encoding="utf-8")
    jp_page = (ROOT / "src/components/JpVocabStudyPage.tsx").read_text(encoding="utf-8")
    en_table = (
        ROOT / "src/components/en-vocab-study-page/EnVocabStudyPageTable.tsx"
    ).read_text(encoding="utf-8")
    en_page = (ROOT / "src/components/EnVocabStudyPage.tsx").read_text(encoding="utf-8")

    if "查看卡片" not in jp_table:
        raise SystemExit("FAIL: JpVocabStudyPageTable missing 查看卡片")
    if "onViewCard" not in jp_table:
        raise SystemExit("FAIL: JpVocabStudyPageTable missing onViewCard")
    if "onViewCard=" not in jp_page and "onViewCard={" not in jp_page:
        raise SystemExit("FAIL: JpVocabStudyPage must wire onViewCard")
    if "JpVocabTeacherQuizFlashcardModal" not in jp_page or 'mode="study"' not in jp_page:
        raise SystemExit("FAIL: JP study must open TeacherQuizFlashcardModal mode=study")

    if "查看卡片" not in en_table:
        raise SystemExit("FAIL: EnVocabStudyPageTable missing 查看卡片")
    if "onViewCard" not in en_table:
        raise SystemExit("FAIL: EnVocabStudyPageTable missing onViewCard")
    if "onViewCard={openStudyFlashcard}" not in en_page and "onViewCard={openStudyFlashcard}" not in en_page.replace(
        " ", ""
    ):
        if "onViewCard=" not in en_page:
            raise SystemExit("FAIL: EnVocabStudyPage must wire onViewCard")
    if "EnVocabTeacherQuizFlashcardModal" not in en_page or 'mode="study"' not in en_page:
        raise SystemExit("FAIL: EN study must open TeacherQuizFlashcardModal mode=study")

    print("[check_vocab_study_view_card] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
