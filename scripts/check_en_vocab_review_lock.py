#!/usr/bin/env python3
"""Regression: en-vocab familiarity lock is 1h after check, not on share/peek."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    review = ROOT / "src/lib/en-vocab-review.ts"
    review_text = review.read_text(encoding="utf-8") if review.is_file() else ""
    for n in [
        "export const EN_VOCAB_REVIEW_LOCK_MS = 60 * 60 * 1000",
        "export function isEnVocabWordReviewLocked",
        "export function hasEnVocabReviewToday",
    ]:
        if n not in review_text:
            errors.append(f"en-vocab-review.ts: missing {n!r}")

    db = ROOT / "src/lib/en-vocab-db.ts"
    db_text = db.read_text(encoding="utf-8") if db.is_file() else ""
    if "isEnVocabWordReviewLocked" not in db_text:
        errors.append("en-vocab-db.ts: record path must use isEnVocabWordReviewLocked")
    if 'error: "review_locked"' not in db_text:
        errors.append('en-vocab-db.ts: must return error "review_locked"')
    # Must not lock levels on share in recordEnVocabReview*
    for fn, start_needle in [
        ("recordEnVocabReview", "export async function recordEnVocabReview("),
        (
            "recordEnVocabReviewWithUsageLevels",
            "export async function recordEnVocabReviewWithUsageLevels(",
        ),
    ]:
        start = db_text.find(start_needle)
        if start < 0:
            errors.append(f"en-vocab-db.ts: missing {fn}")
            continue
        # Next export after this function
        next_export = db_text.find("\nexport async function ", start + len(start_needle))
        chunk = db_text[start : next_export if next_export > 0 else start + 2500]
        if "isEnVocabWordSharedToday" in chunk:
            errors.append(
                f"en-vocab-db.ts: {fn} must not call isEnVocabWordSharedToday for level lock"
            )
        if "shared_level_locked" in chunk:
            errors.append(
                f"en-vocab-db.ts: {fn} must not return shared_level_locked"
            )

    page = ROOT / "src/components/EnVocabPage.tsx"
    page_text = page.read_text(encoding="utf-8") if page.is_file() else ""
    if "isEnVocabWordReviewLocked" not in page_text:
        errors.append("EnVocabPage.tsx: must use isEnVocabWordReviewLocked")
    if "reviewLockedByWordId" not in page_text:
        errors.append("EnVocabPage.tsx: missing reviewLockedByWordId")
    # reviewLockedByWordId must not be driven by sharedTodayWordIds
    lock_block_start = page_text.find("const reviewLockedByWordId = useMemo")
    if lock_block_start < 0:
        errors.append("EnVocabPage.tsx: missing reviewLockedByWordId useMemo")
    else:
        lock_block_end = page_text.find("}, [", lock_block_start)
        lock_chunk = page_text[lock_block_start : lock_block_end + 80]
        if "sharedTodayWordIds" in lock_chunk:
            errors.append(
                "EnVocabPage.tsx: reviewLockedByWordId must not use sharedTodayWordIds"
            )
        if "isEnVocabWordReviewLocked" not in lock_chunk:
            errors.append(
                "EnVocabPage.tsx: reviewLockedByWordId must call isEnVocabWordReviewLocked"
            )

    for banned in [
        "今日已共享，熟悉程度不可更改",
        'setStatus("今日已共享，熟悉程度不可更改。")',
    ]:
        if banned in page_text:
            errors.append(f"EnVocabPage.tsx: must not use shared-lock copy {banned!r}")

    if "勾选已满 1 小时，无法再修改熟悉程度" not in page_text:
        errors.append(
            "EnVocabPage.tsx: missing 1h lock status/title copy"
        )

    flash = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
    flash_text = flash.read_text(encoding="utf-8") if flash.is_file() else ""
    if "勾选已满 1 小时，无法再修改熟悉程度" not in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal.tsx: missing 1h lock title copy"
        )
    if "今日已共享，熟悉程度不可更改" in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal.tsx: must not say shared locks levels"
        )

    rule = ROOT / ".cursor/rules/en-vocab-level-lock-1h.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/en-vocab-level-lock-1h.mdc")

    if errors:
        print("FAIL: en-vocab review lock (1h) guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: en-vocab review lock is 1h after check (not share/peek)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
