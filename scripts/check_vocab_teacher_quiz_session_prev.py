#!/usr/bin/env python3
"""Regression: teacher quiz session keeps checked words for 上一个 navigation.

create / expand must enqueue the full today's N-word list (sequential or one shuffle).
Checked words stay in wordIds so teachers can go back; only 「下一个」 skips to unchecked.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIBS = [
    ROOT / "src/lib/en-vocab-teacher-quiz.ts",
    ROOT / "src/lib/jp-vocab-teacher-quiz.ts",
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def extract_fn(src: str, name: str) -> str:
    m = re.search(
        rf"export function {re.escape(name)}\([\s\S]*?\n\}}(?:\n|$)",
        src,
    )
    if not m:
        fail(f"missing export function {name}")
    return m.group(0)


def check_create(src: str, lang: str) -> None:
    body = extract_fn(src, f"create{lang}VocabTeacherQuizSession")
    # Must NOT filter to unchecked-only before buildWordIds
    if re.search(
        r"filter\w+TeacherQuizUncheckedWords\(\s*quizTargetWords",
        body,
    ):
        fail(
            f"{lang}: create* must not filterUnchecked before buildWordIds "
            "(checked words must stay for 上一个)"
        )
    if "wordIds.every" not in body and "every((id) => hasLevel" not in body:
        fail(f"{lang}: create* should return null when all words have levels")
    if "findIndex((id) => !hasLevel" not in body and "findIndex((id) => !hasLevel(id))" not in body:
        # allow either style
        if "!hasLevel(id)" not in body:
            fail(f"{lang}: create* should land on first unchecked")


def check_expand(src: str, lang: str) -> None:
    body = extract_fn(src, f"expand{lang}VocabTeacherQuizSessionForTarget")
    if re.search(
        r"filter\w+TeacherQuizUncheckedWords\(\s*quizTargetWords",
        body,
    ):
        fail(
            f"{lang}: expand* must not rebuild targetIds from unchecked-only pool "
            "(would drop checked words and disable 上一个)"
        )
    if "targetIds.every" not in body and "every((id) => hasLevel" not in body:
        fail(f"{lang}: expand* should return null when all target words have levels")
    # random path must keep checked ids still in target, not `&& !hasLevel(id)`
    if re.search(r"targetSet\.has\(id\)\s*&&\s*!hasLevel\(id\)", body):
        fail(
            f"{lang}: expand* random kept= must include checked words "
            "(do not filter with !hasLevel)"
        )


def check_en_refresh_resume(src: str) -> None:
    """EN mid-exit / refresh must reopen the word on screen, not first unchecked."""
    body = extract_fn(src, "resolveEnVocabTeacherQuizRefreshResumeIndex")
    if re.search(
        r"resolveEnVocabTeacherQuizResumeIndex\(\s*session\s*,\s*undefined",
        body,
    ) and "currentIndex" not in body.split("return resolveEnVocab")[0]:
        # Allow fallback after currentIndex clamp; forbid sole path = first unchecked
        if "session.currentIndex" not in body:
            fail(
                "EN RefreshResume must prefer session.currentIndex "
                "(mid-exit refresh should reopen the word being quizzed)"
            )
    if "session.currentIndex" not in body:
        fail(
            "EN RefreshResume must use session.currentIndex "
            "(do not jump to first unchecked on refresh)"
        )


def check_en_restore_hook() -> None:
    """Refresh restore must not wipe session or mark restored while pool empty."""
    path = ROOT / "src/hooks/useEnVocabTeacherQuiz.ts"
    src = path.read_text(encoding="utf-8")
    if re.search(
        r"quizTargetWords\.length === 0\s*\{[^}]*quizSessionRestoredRef\.current = true",
        src,
        re.S,
    ):
        fail(
            "useEnVocabTeacherQuiz: do not mark restored when quizTargetWords is empty "
            "(refresh would skip restore → new session at index 0 → 上一个 disabled)"
        )
    # persist(null) must not clear storage
    if re.search(
        r"if\s*\(\s*!session\s*\)\s*\{[^}]*clearEnVocabTeacherQuizSession",
        src,
        re.S,
    ):
        fail(
            "useEnVocabTeacherQuiz: persist must not clearEnVocabTeacherQuizSession on null "
            "(mount null would wipe mid-quiz session before restore)"
        )
    if "savedWordId" not in src:
        fail(
            "useEnVocabTeacherQuiz restore must resume by savedWordId "
            "(keep full queue so 上一个 stays enabled)"
        )
    print(f"OK: {path.relative_to(ROOT)} restore/prev guards")


def main() -> None:
    for path in LIBS:
        if not path.is_file():
            fail(f"missing {path}")
        src = read(path)
        lang = "En" if "en-vocab" in path.name else "Jp"
        check_create(src, lang)
        check_expand(src, lang)
        if lang == "En":
            check_en_refresh_resume(src)
        print(f"OK: {path.relative_to(ROOT)}")
    check_en_restore_hook()
    print("All teacher-quiz session prev-nav guards passed.")


if __name__ == "__main__":
    main()
