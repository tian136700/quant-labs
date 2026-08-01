#!/usr/bin/env python3
"""Regression: study peek button gray follows current teacher live word.

After peek, teacherLiveWordId must refresh from shared.teacher_live_word_id
so the button re-enables when the teacher advances. Do not poll teacher-quiz-live.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

JP_SHARED = ROOT / "src/app/api/jp-vocab/shared/route.ts"
EN_SHARED = ROOT / "src/app/api/en-vocab/shared/route.ts"
JP_STUDY = ROOT / "src/components/JpVocabStudyPage.tsx"
EN_STUDY = ROOT / "src/components/EnVocabStudyPage.tsx"
RULE = ROOT / ".cursor/rules/vocab-study-peek-button-live.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def must_contain(path: Path, needle: str, hint: str) -> None:
    if needle not in path.read_text(encoding="utf-8"):
        fail(f"{path.relative_to(ROOT)}: missing {hint} ({needle!r})")


def must_not_contain(path: Path, needle: str, hint: str) -> None:
    if needle in path.read_text(encoding="utf-8"):
        fail(f"{path.relative_to(ROOT)}: forbidden {hint} ({needle!r})")


def main() -> None:
    for path in (JP_SHARED, EN_SHARED, JP_STUDY, EN_STUDY, RULE):
        if not path.is_file():
            fail(f"missing {path}")

    must_contain(JP_SHARED, "teacher_live_word_id", "JP shared returns live word id")
    must_contain(JP_SHARED, "getJpVocabTeacherQuizLive", "JP shared reads live state")
    must_contain(
        JP_SHARED,
        "bypassCache: true",
        "JP shared must bypass live read cache (stale id keeps peek gray)",
    )
    must_contain(EN_SHARED, "teacher_live_word_id", "EN shared returns live word id")
    must_contain(EN_SHARED, "getEnVocabTeacherQuizLive", "EN shared reads live state")
    must_contain(
        EN_SHARED,
        "bypassCache: true",
        "EN shared must bypass live read cache (stale id keeps peek gray)",
    )

    for page, lang in ((JP_STUDY, "JP"), (EN_STUDY, "EN")):
        must_contain(page, "applyTeacherLiveWordId", f"{lang} study applies live id from shared")
        must_contain(page, "teacher_live_word_id", f"{lang} study reads teacher_live_word_id")
        must_contain(page, "teacherLiveWordShared", f"{lang} peek button uses live-shared gate")
        must_not_contain(
            page,
            "teacher-quiz-live?scope=study",
            f"{lang} must not poll live GET for button state",
        )

    must_contain(RULE, "teacher_live_word_id", "rule documents shared live id")
    print("OK: study peek live refresh guards passed.")


if __name__ == "__main__":
    main()
