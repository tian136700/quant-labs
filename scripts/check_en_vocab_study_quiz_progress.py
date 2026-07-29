#!/usr/bin/env python3
"""Regression: /en-vocab/study progress = shared list length / quiz_target.

Peek adds rows to en_vocab_shared without today_check_count; using server
today_check as numerator stays 0/N while the list already has words.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRESS_LIB = ROOT / "src/lib/en-vocab-daily-quiz-progress.ts"
STUDY_PAGE = ROOT / "src/components/EnVocabStudyPage.tsx"
SHARED_ROUTE = ROOT / "src/app/api/en-vocab/shared/route.ts"
DAILY_DB = ROOT / "src/lib/en-vocab-db/daily_settings.ts"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def must_contain(path: Path, needle: str, hint: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        fail(f"{path.relative_to(ROOT)}: missing {hint!r} ({needle!r})")


def check_formula_helper() -> None:
    src = PROGRESS_LIB.read_text(encoding="utf-8")
    if "export function computeEnVocabStudyPageQuizProgress" not in src:
        fail("missing computeEnVocabStudyPageQuizProgress")
    fn = re.search(
        r"export function computeEnVocabStudyPageQuizProgress\([\s\S]*?\n\}",
        src,
    )
    if not fn:
        fail("could not extract computeEnVocabStudyPageQuizProgress body")
    body = fn.group(0)
    if "sharedItemCount" not in body:
        fail("study progress helper must take sharedItemCount")
    if "today_check" in body or "enVocabTodayCheckStats" in body:
        fail("study progress helper must not use today_check stats")
    print("OK: computeEnVocabStudyPageQuizProgress")


def check_study_page() -> None:
    must_contain(
        STUDY_PAGE,
        "computeEnVocabStudyPageQuizProgress",
        "client self-calc from list length",
    )
    must_contain(
        STUDY_PAGE,
        "computeEnVocabStudyPageQuizProgress(items.length, quizTargetTotal)",
        "numerator = items.length",
    )
    must_contain(
        STUDY_PAGE,
        'JpVocabDailyQuizProgressBar progress={quizProgress} variant="study"',
        "study progress bar",
    )
    print("OK: EnVocabStudyPage uses list length")


def check_shared_api() -> None:
    route = SHARED_ROUTE.read_text(encoding="utf-8")
    if "getEnVocabDailyQuizProgress" in route:
        fail(
            "shared route must not call getEnVocabDailyQuizProgress "
            "(today_check COUNT); use getEnVocabStudyQuizProgressTarget"
        )
    must_contain(
        SHARED_ROUTE,
        "getEnVocabStudyQuizProgressTarget",
        "study shared API returns target-only stub",
    )
    must_contain(
        DAILY_DB,
        "export async function getEnVocabStudyQuizProgressTarget",
        "DB helper for study target",
    )
    stub = re.search(
        r"export async function getEnVocabStudyQuizProgressTarget\([\s\S]*?\n\}",
        DAILY_DB.read_text(encoding="utf-8"),
    )
    if not stub:
        fail("missing getEnVocabStudyQuizProgressTarget body")
    if "countEnVocabTodayCheckedWords" in stub.group(0):
        fail("study target helper must not COUNT today-checked words")
    print("OK: shared API study target-only")


def main() -> None:
    for path in (PROGRESS_LIB, STUDY_PAGE, SHARED_ROUTE, DAILY_DB):
        if not path.is_file():
            fail(f"missing {path}")
    check_formula_helper()
    check_study_page()
    check_shared_api()
    print("All en-vocab study quiz progress guards passed.")


if __name__ == "__main__":
    main()
