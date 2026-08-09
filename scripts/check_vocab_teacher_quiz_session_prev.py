#!/usr/bin/env python3
"""Regression: teacher quiz session round isolation + 上一个 navigation.

create: enqueue only unchecked-at-start words (no morning words in afternoon round).
expand: keep this-round checked words in kept; append only new unchecked ids.
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
    # Must filter to unchecked-only at session start (round isolation)
    if not re.search(
        r"filter\w+TeacherQuizUncheckedWords\(\s*quizTargetWords",
        body,
    ):
        fail(
            f"{lang}: create* must filterUncheckedWords(quizTargetWords) at start "
            "(exclude already-checked words so 上一个 stays in this round)"
        )
    # Must not build from full quizTargetWords when hasLevel is present
    if re.search(
        r"build\w+TeacherQuizWordIds\(\s*mode\s*,\s*quizTargetWords",
        body,
    ):
        fail(
            f"{lang}: create* must not buildWordIds(mode, quizTargetWords) "
            "(would re-enqueue prior-round checked words)"
        )
    if "pool" not in body:
        fail(f"{lang}: create* should use unchecked pool variable")


def check_expand(src: str, lang: str) -> None:
    body = extract_fn(src, f"expand{lang}VocabTeacherQuizSessionForTarget")
    # Must NOT rebuild entire targetIds from unchecked-only pool
    if re.search(
        r"filter\w+TeacherQuizUncheckedWords\(\s*quizTargetWords",
        body,
    ):
        fail(
            f"{lang}: expand* must not rebuild targetIds from unchecked-only pool "
            "(would drop this-round checked words and disable 上一个)"
        )
    if "targetIds.every" not in body and "every((id) => hasLevel" not in body:
        fail(f"{lang}: expand* should return null when all target words have levels")
    # kept must include this-round checked (no !hasLevel on kept filter)
    if re.search(r"targetSet\.has\(id\)\s*&&\s*!hasLevel\(id\)", body):
        fail(
            f"{lang}: expand* random kept= must include checked words "
            "(do not filter with !hasLevel)"
        )
    # append path should only add unchecked newcomers
    if not re.search(
        r"!inSession\.has\(id\)\s*&&\s*\(!hasLevel\s*\|\|\s*!hasLevel\(id\)\)",
        body,
    ):
        fail(
            f"{lang}: expand* append filter must skip already-checked newcomers "
            "(!inSession && (!hasLevel || !hasLevel(id)))"
        )


def check_en_refresh_resume(src: str) -> None:
    """EN mid-exit / refresh must reopen the word on screen, not first unchecked."""
    body = extract_fn(src, "resolveEnVocabTeacherQuizRefreshResumeIndex")
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
