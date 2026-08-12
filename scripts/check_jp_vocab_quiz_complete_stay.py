#!/usr/bin/env python3
"""Regression: JP teacher quiz complete stays on last word + modal above card."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    page = (ROOT / "src/components/JpVocabPage.tsx").read_text(encoding="utf-8")
    # Must not auto-clear session when progress completes
    if re.search(
        r"dailyQuizProgress\.complete[\s\S]{0,200}setQuizSession\(null\)",
        page,
    ) and re.search(
        r"useEffect\(\(\)\s*=>\s*\{[\s\S]{0,300}displayQuizProgress\.complete[\s\S]{0,200}setQuizSession\(null\)",
        page,
    ):
        fail(
            "JpVocabPage must not auto-clear quizSession when progress completes "
            "(stay on last word)"
        )
    if "closeTeacherQuizFlashcard" not in page:
        fail("JpVocabPage must wire closeTeacherQuizFlashcard")

    hook = (ROOT / "src/hooks/useJpVocabTeacherQuiz.ts").read_text(encoding="utf-8")
    finish = re.search(
        r"const finishTeacherQuiz = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[",
        hook,
    )
    if not finish:
        fail("missing finishTeacherQuiz")
    body = finish.group(0)
    if "setQuizSession(null)" in body and "onTeacherQuizSessionFinished" in body:
        # finishing for real must not clear before callback
        if re.search(
            r"setShowQuizFlashcard\(false\);\s*setQuizSession\(null\);\s*onTeacherQuizSessionFinished",
            body,
        ):
            fail(
                "finishTeacherQuiz must keep flashcard open on complete "
                "(not setShowQuizFlashcard(false)+setQuizSession(null) before finished)"
            )
    if "closeTeacherQuizFlashcard" not in hook:
        fail("useJpVocabTeacherQuiz must export closeTeacherQuizFlashcard")
    if "onTeacherQuizSessionFinished?.()" not in body:
        fail("finishTeacherQuiz must call onTeacherQuizSessionFinished when done")

    modal = (ROOT / "src/components/JpVocabDailyQuizCompleteModal.tsx").read_text(
        encoding="utf-8"
    )
    if "本轮单词已抽查完成" not in modal:
        fail("complete modal title must be 本轮单词已抽查完成")
    if "关闭本窗口" not in modal:
        fail("complete modal must have 关闭本窗口 button")
    if "停留在本页面" not in modal:
        fail("complete modal must have 停留在本页面 button")
    if "tryCloseBrowserTab" not in modal:
        fail("complete modal must use tryCloseBrowserTab for close-tab")
    if not re.search(r"z-index:\s*1105", modal):
        fail("complete modal z-index must be > flashcard (~1002), expected 1105")
    if "flashcardStillOpen" not in modal:
        fail("complete modal must support flashcardStillOpen")
    helper = (ROOT / "src/lib/try-close-browser-tab.ts").read_text(encoding="utf-8")
    if "window.close" not in helper:
        fail("try-close-browser-tab.ts must call window.close")

    print("OK: jp teacher quiz complete stay-on-last-word guards passed.")


if __name__ == "__main__":
    main()
