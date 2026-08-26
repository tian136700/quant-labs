#!/usr/bin/env python3
"""Regression: EN daily order must follow JP never-quizzed + final_score, not raw risk only."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    shared = read("src/lib/en-vocab-shared.ts")
    daily = read("src/lib/en-vocab-daily-order.ts")
    settings = read("src/lib/en-vocab-db/daily_settings.ts")
    modal = read("src/components/EnVocabTeacherQuizFlashcardModal.tsx")
    alerts = read(
        "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardAlerts.tsx"
    )
    errors: list[str] = []

    if "jpVocabFinalQuizScore" not in shared:
        errors.append("en-vocab-shared.ts must call jpVocabFinalQuizScore")
    if "isJpVocabWordEligibleNeverQuizzedForFront" not in shared:
        errors.append("must reuse JP never-quizzed front bucket")
    if "isJpVocabWordSameDayNewNeverQuizzed" not in shared:
        errors.append("must reuse JP same-day defer bucket")
    if "POSITIVE_INFINITY" not in shared:
        errors.append("risk column sort must treat never-quizzed as +∞")
    if "EN_VOCAB_DAILY_ORDER_ALGO" not in daily:
        errors.append("daily-order must declare EN_VOCAB_DAILY_ORDER_ALGO")
    if "jp_srs_v1" not in daily:
        errors.append("order_algo must be jp_srs_v1")
    if "isJpVocabWordSrsDue" not in shared:
        errors.append("daily sort must use isJpVocabWordSrsDue (SRS due)")
    if "enVocabDailyOrderAlgoCurrent" not in settings:
        errors.append("ensure must recompute when order_algo upgrades")
    if "materializeEnVocabTeacherVisible" not in settings:
        errors.append("algo upgrade must rematerialize teacher visible pool")

    # 老师端「下一个」：同步中须拦截并弹提示，禁止静默点不动
    if "setSyncWaitHint(true)" not in modal:
        errors.append("tryGoNext must show sync-wait hint while saveBusy")
    if "正在同步给学生" not in alerts:
        errors.append("must alert teacher to wait while syncing to student")
    if "notesWord?.id === word.id" not in modal:
        errors.append("must not paint previous notesWord over next card")

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("ok: en-vocab daily order + sync-wait next hint")
    return 0


if __name__ == "__main__":
    sys.exit(main())
