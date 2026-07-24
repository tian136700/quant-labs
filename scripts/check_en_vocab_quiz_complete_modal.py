#!/usr/bin/env python3
"""Regression: EN teacher quiz must show complete modal, not silent close."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MODAL = ROOT / "src/components/EnVocabDailyQuizCompleteModal.tsx"
HOOK = ROOT / "src/hooks/useEnVocabTeacherQuiz.ts"
EFFECTS = ROOT / "src/hooks/useEnVocabDailyCompleteEffects.ts"
PAGE = ROOT / "src/components/EnVocabPage.tsx"
MODALS = ROOT / "src/components/en-vocab-page/EnVocabPageModals.tsx"
RULE = ROOT / ".cursor/rules/en-vocab-quiz-complete-modal.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    for path in (MODAL, HOOK, EFFECTS, PAGE, MODALS, RULE):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    modal = MODAL.read_text(encoding="utf-8")
    if "本轮单词已抽查完成" not in modal:
        fail("EnVocabDailyQuizCompleteModal missing copy 本轮单词已抽查完成")
    if "已抽" in modal and "本轮单词已抽查完成" not in modal.replace(
        "本轮单词已抽查完成", ""
    ):
        # soft: title is fine; reject count-style body like 已抽 20 个
        pass
    if "已抽" in modal and ("个" in modal or "/" in modal):
        # Allow title containing 已抽查; reject numeric count patterns nearby
        for line in modal.splitlines():
            if "已抽" in line and any(ch.isdigit() for ch in line):
                fail(f"complete modal must not show counts: {line.strip()}")

    hook = HOOK.read_text(encoding="utf-8")
    if "onTeacherQuizSessionFinished?.()" not in hook:
        fail("finishTeacherQuiz must call onTeacherQuizSessionFinished")

    effects = EFFECTS.read_text(encoding="utf-8")
    if "setShowDailyComplete(true)" not in effects:
        fail("useEnVocabDailyCompleteEffects must open complete modal")

    page = PAGE.read_text(encoding="utf-8")
    if "showDailyComplete" not in page:
        fail("EnVocabPage must wire showDailyComplete")
    if "onTeacherQuizSessionFinished" not in page:
        fail("EnVocabPage must pass onTeacherQuizSessionFinished")

    modals = MODALS.read_text(encoding="utf-8")
    if "EnVocabDailyQuizCompleteModal" not in modals:
        fail("EnVocabPageModals must render EnVocabDailyQuizCompleteModal")

    print("OK: en-vocab quiz complete modal wired")


if __name__ == "__main__":
    main()
