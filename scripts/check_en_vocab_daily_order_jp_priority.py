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
    if "jp_priority_v1" not in daily:
        errors.append("order_algo must be jp_priority_v1")
    if "enVocabDailyOrderAlgoCurrent" not in settings:
        errors.append("ensure must recompute when order_algo upgrades")
    if "pickEnVocabVisibleIds" not in settings:
        errors.append("ensure teacher visible must rematerialize when order changes")

    # 老师端「下一个」不得被整段 saveBusy（含分享同步）卡死
    if "if (saveBusy) return" in modal:
        errors.append("tryGoNext must not block on full saveBusy (align JP isSaving)")
    if "disabled={saveBusy}" in modal:
        errors.append("nav next must not disable on full saveBusy")
    if "notesWord?.id === word.id" not in modal:
        errors.append("must not paint previous notesWord over next card")

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("ok: en-vocab daily order aligns JP priority; teacher next not blocked by share sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
