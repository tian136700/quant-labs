#!/usr/bin/env python3
"""Regression: teacher quiz live sync must check ok + retry; peek bypasses cache."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needles: list[str], label: str) -> list[str]:
    text = path.read_text(encoding="utf-8")
    missing = [n for n in needles if n not in text]
    if missing:
        return [f"{label}: missing {m!r} in {path.relative_to(ROOT)}" for m in missing]
    return []


def must_not_contain(path: Path, needles: list[str], label: str) -> list[str]:
    text = path.read_text(encoding="utf-8")
    bad = [n for n in needles if n in text]
    if bad:
        return [f"{label}: forbidden {b!r} still in {path.relative_to(ROOT)}" for b in bad]
    return []


def main() -> int:
    errors: list[str] = []

    helper = ROOT / "src/lib/vocab-teacher-quiz-live-sync.ts"
    errors += must_contain(
        helper,
        [
            "VOCAB_TEACHER_QUIZ_LIVE_SYNC_TIMEOUT_MS",
            "VOCAB_TEACHER_QUIZ_LIVE_SYNC_RETRY_MS",
            "VOCAB_STUDENT_PEEK_TIMEOUT_MS",
            "putVocabTeacherQuizLiveWord",
            "abortSignalAfter",
        ],
        "helper",
    )

    for hook, api in (
        (
            ROOT / "src/hooks/useJpVocabTeacherQuiz.ts",
            "/api/jp-vocab/teacher-quiz-live",
        ),
        (
            ROOT / "src/hooks/useEnVocabTeacherQuiz.ts",
            "/api/en-vocab/teacher-quiz-live",
        ),
    ):
        errors += must_contain(
            hook,
            [
                "putVocabTeacherQuizLiveWord",
                "VOCAB_TEACHER_QUIZ_LIVE_SYNC_RETRY_MS",
                "teacherQuizLiveSyncedIdRef",
                "if (!ok) throw",
                api,
            ],
            "hook",
        )
        errors += must_not_contain(
            hook,
            ["teacherQuizLiveWordRef.current = wordId"],
            "hook",
        )

    for live in (
        ROOT / "src/lib/jp-vocab-db/live_rollover.ts",
        ROOT / "src/lib/en-vocab-db/live.ts",
    ):
        errors += must_contain(
            live,
            ["bypassCache?: boolean", "bypassCache: true"],
            "live-db",
        )

    for route in (
        ROOT / "src/app/api/jp-vocab/teacher-quiz-live/route.ts",
        ROOT / "src/app/api/en-vocab/teacher-quiz-live/route.ts",
    ):
        errors += must_contain(
            route,
            ["scope === \"study\"", "bypassCache: true"],
            "route",
        )

    for study in (
        ROOT / "src/components/JpVocabStudyPage.tsx",
        ROOT / "src/components/EnVocabStudyPage.tsx",
    ):
        errors += must_contain(
            study,
            [
                "VOCAB_STUDENT_PEEK_TIMEOUT_MS",
                "abortSignalAfter",
                "AbortError",
                "获取超时",
            ],
            "study",
        )

    rule = ROOT / ".cursor/rules/vocab-teacher-quiz-live-sync.mdc"
    if not rule.is_file():
        errors.append("missing rule .cursor/rules/vocab-teacher-quiz-live-sync.mdc")

    if errors:
        print("check_vocab_teacher_quiz_live_sync FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_vocab_teacher_quiz_live_sync OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
