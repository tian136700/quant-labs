#!/usr/bin/env python3
"""Regression: /jp-vocab/study progress = shared list length / quiz_target.

Peek adds rows to jp_vocab_shared without today_check_count; using server
today_check as numerator stays 0/N while the list already has words.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRESS_LIB = ROOT / "src/lib/jp-vocab-daily-quiz-progress.ts"
STUDY_PAGE = ROOT / "src/components/JpVocabStudyPage.tsx"
SHARED_ROUTE = ROOT / "src/app/api/jp-vocab/shared/route.ts"
SHARE_DB = ROOT / "src/lib/jp-vocab-db/share.ts"
RULE = ROOT / ".cursor/rules/jp-vocab-study-quiz-progress.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def must_contain(path: Path, needle: str, hint: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        fail(f"{path.relative_to(ROOT)}: missing {hint!r} ({needle!r})")


def must_not_contain(path: Path, needle: str, hint: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle in text:
        fail(f"{path.relative_to(ROOT)}: must not {hint} ({needle!r})")


def check_formula_helper() -> None:
    src = PROGRESS_LIB.read_text(encoding="utf-8")
    if "export function computeJpVocabStudyPageQuizProgress" not in src:
        fail("missing computeJpVocabStudyPageQuizProgress")
    # crude: sharedItemCount used as checked
    fn = re.search(
        r"export function computeJpVocabStudyPageQuizProgress\([\s\S]*?\n\}",
        src,
    )
    if not fn:
        fail("could not extract computeJpVocabStudyPageQuizProgress body")
    body = fn.group(0)
    if "sharedItemCount" not in body:
        fail("study progress helper must take sharedItemCount")
    if "today_check" in body or "jpVocabTodayCheckStats" in body:
        fail("study progress helper must not use today_check stats")
    print("OK: computeJpVocabStudyPageQuizProgress")


def check_study_page() -> None:
    must_contain(
        STUDY_PAGE,
        "computeJpVocabStudyPageQuizProgress",
        "client self-calc from list length",
    )
    must_contain(
        STUDY_PAGE,
        "computeJpVocabStudyPageQuizProgress(items.length, quizTargetTotal)",
        "numerator = items.length",
    )
    print("OK: JpVocabStudyPage uses list length")


def check_shared_api() -> None:
    route = SHARED_ROUTE.read_text(encoding="utf-8")
    if "getJpVocabDailyQuizProgress" in route:
        fail(
            "shared route must not call getJpVocabDailyQuizProgress "
            "(today_check COUNT); use getJpVocabStudyQuizProgressTarget"
        )
    must_contain(
        SHARED_ROUTE,
        "getJpVocabStudyQuizProgressTarget",
        "study shared API returns target-only stub",
    )
    must_contain(
        SHARE_DB,
        "export async function getJpVocabStudyQuizProgressTarget",
        "DB helper for study target",
    )
    stub = re.search(
        r"export async function getJpVocabStudyQuizProgressTarget\([\s\S]*?\n\}",
        SHARE_DB.read_text(encoding="utf-8"),
    )
    if not stub:
        fail("missing getJpVocabStudyQuizProgressTarget body")
    if "countJpVocabTodayCheckedWords" in stub.group(0):
        fail("study target helper must not COUNT today-checked words")
    print("OK: shared API study target-only")


def check_rule() -> None:
    if not RULE.is_file():
        fail(f"missing rule {RULE.relative_to(ROOT)}")
    print("OK: cursor rule present")


def main() -> None:
    for path in (PROGRESS_LIB, STUDY_PAGE, SHARED_ROUTE, SHARE_DB):
        if not path.is_file():
            fail(f"missing {path}")
    check_formula_helper()
    check_study_page()
    check_shared_api()
    check_rule()
    print("All jp-vocab study quiz progress guards passed.")


if __name__ == "__main__":
    main()
