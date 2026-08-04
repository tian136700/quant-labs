#!/usr/bin/env python3
"""回归：抽完后须能「查看上一个单词」回看本轮卡片。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    browse = ROOT / "src/lib/vocab-teacher-quiz-post-complete-browse.ts"
    panel = ROOT / "src/components/VocabTeacherDailyQuizDonePanel.tsx"
    if not browse.is_file():
        errors.append("missing vocab-teacher-quiz-post-complete-browse.ts")
    if not panel.is_file():
        errors.append("missing VocabTeacherDailyQuizDonePanel.tsx")
    elif "查看上一个单词" not in panel.read_text(encoding="utf-8"):
        errors.append("done panel must offer 查看上一个单词")

    for hook in (
        "src/hooks/useJpVocabTeacherQuiz.ts",
        "src/hooks/useEnVocabTeacherQuiz.ts",
    ):
        text = (ROOT / hook).read_text(encoding="utf-8")
        if "openPostCompleteLastWord" not in text:
            errors.append(f"{hook} must expose openPostCompleteLastWord")
        if "rememberCompletedQuizWordIds" not in text:
            errors.append(f"{hook} must remember completed session word ids")
        if "navigateQuizCardPreview" not in text:
            errors.append(f"{hook} must navigate multi-word preview browse")

    jp_modal = (ROOT / "src/components/JpVocabDailyQuizCompleteModal.tsx").read_text(
        encoding="utf-8"
    )
    en_modal = (ROOT / "src/components/EnVocabDailyQuizCompleteModal.tsx").read_text(
        encoding="utf-8"
    )
    if "onViewLastWord" not in jp_modal or "查看上一个单词" not in jp_modal:
        errors.append("Jp complete modal must have 查看上一个单词")
    if "onViewLastWord" not in en_modal or "查看上一个单词" not in en_modal:
        errors.append("En complete modal must have 查看上一个单词")

    jp_list = (ROOT / "src/components/jp-vocab-page/JpVocabPageWordList.tsx").read_text(
        encoding="utf-8"
    )
    en_list = (ROOT / "src/components/en-vocab-page/EnVocabPageWordList.tsx").read_text(
        encoding="utf-8"
    )
    if "VocabTeacherDailyQuizDonePanel" not in jp_list:
        errors.append("Jp word list must show done panel when complete")
    if "VocabTeacherDailyQuizDonePanel" not in en_list:
        errors.append("En word list must show done panel when complete")

    jp_modals = (ROOT / "src/components/jp-vocab-page/JpVocabPageModals.tsx").read_text(
        encoding="utf-8"
    )
    en_modals = (ROOT / "src/components/en-vocab-page/EnVocabPageModals.tsx").read_text(
        encoding="utf-8"
    )
    if "onNavigateQuizPreview" not in jp_modals:
        errors.append("Jp preview modal must wire onNavigateQuizPreview")
    if "onNavigateQuizPreview" not in en_modals:
        errors.append("En preview modal must wire onNavigateQuizPreview")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    print("ok: teacher quiz post-complete browse (view last word)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
