#!/usr/bin/env python3
"""Regression: EN teacher quiz must show complete modal, stay on last word.

sharedToday / peek alone must NOT count as familiarity checked
(else admin still shows 从未抽查 while teacher skipped usage levels).
"""

from __future__ import annotations

import re
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
    if "关闭本窗口" not in modal:
        fail("EnVocabDailyQuizCompleteModal must have 关闭本窗口 button")
    if "停留在本页面" not in modal:
        fail("EnVocabDailyQuizCompleteModal must have 停留在本页面 button")
    if "tryCloseBrowserTab" not in modal:
        fail("EnVocabDailyQuizCompleteModal must use tryCloseBrowserTab")
    if "flashcardStillOpen" not in modal:
        fail("EnVocabDailyQuizCompleteModal must support flashcardStillOpen")
    if "z-index: 1105" not in modal and "z-index:\n          1105" not in modal:
        if "z-index: 1105" not in modal.replace(" ", ""):
            if not re.search(r"z-index:\s*1105", modal):
                fail("EN complete modal z-index must be 1105 (above flashcard)")
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
    if "enVocabTeacherQuizCountsAsChecked" not in hook:
        fail("quizWordHasLevel must use enVocabTeacherQuizCountsAsChecked")
    if "sharedTodayWordIds" not in hook:
        fail("useEnVocabTeacherQuiz must take sharedTodayWordIds")
    if "closeTeacherQuizFlashcard" not in hook:
        fail("useEnVocabTeacherQuiz must export closeTeacherQuizFlashcard")
    finish = re.search(
        r"const finishTeacherQuiz = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[",
        hook,
    )
    if not finish:
        fail("missing finishTeacherQuiz")
    body = finish.group(0)
    if re.search(
        r"setShowQuizFlashcard\(false\);\s*setQuizSession\(null\);\s*"
        r"(if \(user\?\.id\) clearEnVocabTeacherQuizSession[^\n]*\n\s*)?"
        r"onTeacherQuizSessionFinished",
        body,
    ):
        fail(
            "finishTeacherQuiz must keep flashcard open on complete "
            "(not setShowQuizFlashcard(false)+setQuizSession(null) before finished)"
        )
    if "currentIndex: Math.max(0, expanded.wordIds.length - 1)" not in body:
        fail("finishTeacherQuiz must stay on last word index when complete")

    review = (ROOT / "src/lib/en-vocab-review.ts").read_text(encoding="utf-8")
    if "export function enVocabTeacherQuizCountsAsChecked" not in review:
        fail("missing enVocabTeacherQuizCountsAsChecked")
    # sharedToday 参数可保留兼容，但函数体禁止 if (sharedToday) return true
    fn = re.search(
        r"export function enVocabTeacherQuizCountsAsChecked\([\s\S]*?\n\}",
        review,
    )
    if not fn:
        fail("cannot find enVocabTeacherQuizCountsAsChecked body")
    body = fn.group(0)
    if re.search(r"if\s*\(\s*options\.sharedToday\s*\)\s*return\s+true", body):
        fail(
            "enVocabTeacherQuizCountsAsChecked must NOT treat sharedToday alone "
            "as checked (peek/share-without-review → admin 从未抽查)"
        )
    if "effectiveEnVocabDisplayLevel" not in body and "sessionLevel" not in body:
        fail("countsAsChecked must use sessionLevel / effectiveEnVocabDisplayLevel")

    flash = (ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx").read_text(
        encoding="utf-8"
    )
    if "enVocabTeacherQuizCountsAsChecked" not in flash:
        fail("flashcard wordHasLevel must use enVocabTeacherQuizCountsAsChecked")
    if "isShared || wordHasLevel(w.id)" in flash:
        fail(
            "tryGoNext must not skip usage gate with isShared alone "
            "(only wordHasLevel after real check)"
        )
    if "if (wordHasLevel(w.id))" not in flash:
        fail("tryGoNext must allow advance when wordHasLevel after real check")

    effects = EFFECTS.read_text(encoding="utf-8")
    if "setShowDailyComplete(true)" not in effects:
        fail("useEnVocabDailyCompleteEffects must open complete modal")

    page = PAGE.read_text(encoding="utf-8")
    if "showDailyComplete" not in page:
        fail("EnVocabPage must wire showDailyComplete")
    if "onTeacherQuizSessionFinished" not in page:
        fail("EnVocabPage must pass onTeacherQuizSessionFinished")
    if "quizFlashcardStillOpen={showQuizFlashcard}" not in page:
        fail("EnVocabPage must pass quizFlashcardStillOpen={showQuizFlashcard}")
    if "closeTeacherQuizFlashcard" not in page:
        fail("EnVocabPage must wire closeTeacherQuizFlashcard")
    if "onQuizFlashcardClose={closeTeacherQuizFlashcard}" not in page:
        fail("EnVocabPage onQuizFlashcardClose must be closeTeacherQuizFlashcard")
    if re.search(
        r"useEffect\(\(\)\s*=>\s*\{[\s\S]{0,400}displayQuizProgress\.complete[\s\S]{0,200}setQuizSession\(null\)",
        page,
    ):
        fail(
            "EnVocabPage must not auto-clear quizSession when progress completes "
            "(stay on last word like Japanese)"
        )

    modals = MODALS.read_text(encoding="utf-8")
    if "EnVocabDailyQuizCompleteModal" not in modals:
        fail("EnVocabPageModals must render EnVocabDailyQuizCompleteModal")
    if "flashcardStillOpen={props.quizFlashcardStillOpen}" not in modals:
        fail("EnVocabPageModals must pass flashcardStillOpen")

    rule = RULE.read_text(encoding="utf-8")
    if "closeTeacherQuizFlashcard" not in rule:
        fail("rule must document closeTeacherQuizFlashcard / stay on last word")
    if "enVocabTeacherQuizCountsAsChecked" not in rule:
        fail("rule must document enVocabTeacherQuizCountsAsChecked")

    print("OK: en-vocab quiz complete modal wired")


if __name__ == "__main__":
    main()
