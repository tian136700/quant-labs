#!/usr/bin/env python3
"""Regression: teacher quiz save vs sync progress copy must stay distinct."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN = (
    "已同步过，下一个不会再发",
    "下一个不会再发",
    "不会重复发送",
    "LEVEL_SYNC_HINT_ALREADY_SHARED",
    "JP_VOCAB_LEVEL_SYNC_HINT",
    "EN_VOCAB_LEVEL_SYNC_HINT",
)

SCAN_PATHS = (
    "src/components/jp-vocab-teacher-quiz-flashcard/helpers.ts",
    "src/components/en-vocab-teacher-quiz-flashcard/helpers.ts",
    "src/components/JpVocabTeacherQuizFlashcardModal.tsx",
    "src/components/EnVocabTeacherQuizFlashcardModal.tsx",
    "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageFooter.tsx",
    "src/lib/jp-vocab-save-progress.ts",
    "src/hooks/useJpVocabReviewActions.ts",
    "src/hooks/useEnVocabReviewActions.ts",
)


def main() -> int:
    errors: list[str] = []
    for rel in SCAN_PATHS:
        text = (ROOT / rel).read_text(encoding="utf-8")
        for needle in FORBIDDEN:
            if needle in text:
                errors.append(f"{rel}: must not contain {needle!r}")

    progress = (ROOT / "src/lib/jp-vocab-save-progress.ts").read_text(encoding="utf-8")
    for needle in (
        "正在存储你勾选的数据…",
        "此单词正在同步给学生复习…",
        "排队保存中…",
    ):
        if needle not in progress:
            errors.append(f"jp-vocab-save-progress.ts: missing {needle!r}")

    for rel in (
        "src/hooks/useJpVocabReviewActions.ts",
        "src/hooks/useEnVocabReviewActions.ts",
    ):
        text = (ROOT / rel).read_text(encoding="utf-8")
        if 'progressKindByWordId' not in text:
            errors.append(f"{rel}: missing progressKindByWordId")
        if '"save_level"' not in text or '"sync_to_student"' not in text:
            errors.append(f"{rel}: must set save_level and sync_to_student kinds")

    for rel in (
        "src/components/JpVocabTeacherQuizFlashcardModal.tsx",
        "src/components/EnVocabTeacherQuizFlashcardModal.tsx",
    ):
        text = (ROOT / rel).read_text(encoding="utf-8")
        if "progressKindByWordId[w.id]" not in text:
            errors.append(f"{rel}: must read progressKindByWordId for labels")
        # Forbidden: treat any shareProgressMap entry as sync_to_student
        if 'isSharing\n    ? "sync_to_student"' in text or 'isSharing ? "sync_to_student"' in text:
            errors.append(f"{rel}: must not infer sync_to_student from isSharing")

    if errors:
        print("FAIL: teacher save/sync progress copy", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("ok: teacher save vs sync progress copy")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
