#!/usr/bin/env python3
"""Regression: en-lesson completed → vocab sync for ALL categories (incl. 托业)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def must_contain(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"{label}: missing {needle!r}")


def must_not_contain(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle in text:
        errors.append(f"{label}: must not contain {needle!r}")


def main() -> int:
    errors: list[str] = []

    sync = (ROOT / "src/lib/en-lesson-vocab-sync.ts").read_text(encoding="utf-8")
    db = (ROOT / "src/lib/en-lesson-db.ts").read_text(encoding="utf-8")
    route = (ROOT / "src/app/api/en-lesson/route.ts").read_text(encoding="utf-8")
    rule = ROOT / ".cursor/rules/en-lesson-completed-sync-all-categories.mdc"

    must_contain(sync, "所有分类一律同步", "vocab-sync", errors)
    must_contain(sync, "syncEnLessonToVocab", "vocab-sync", errors)
    must_contain(sync, "backfillCompletedEnLessonsToVocab", "vocab-sync", errors)
    must_not_contain(sync, 'category.includes("托业")', "vocab-sync", errors)
    must_not_contain(sync, 'category === "托业"', "vocab-sync", errors)

    must_contain(db, "syncEnLessonToVocab", "en-lesson-db", errors)
    # 已 completed 再点也要 sync（不要只写 completed && !before.completed）
    if "if (completed && !before.completed)" in db:
        errors.append("en-lesson-db: must sync whenever completed, not only on transition")
    must_contain(db, "if (completed) {\n      await syncEnLessonToVocab", "en-lesson-db", errors)

    must_contain(route, 'backfill_vocab_sync', "api route", errors)
    must_contain(route, "backfillCompletedEnLessonsToVocab", "api route", errors)

    if not rule.is_file():
        errors.append("missing en-lesson-completed-sync-all-categories.mdc")
    else:
        rule_text = rule.read_text(encoding="utf-8")
        must_contain(rule_text, "托业", "rule", errors)
        must_contain(rule_text, "一律同步", "rule", errors)

    if errors:
        print("FAIL")
        for e in errors:
            print(" ", e)
        return 1
    print("OK en-lesson completed sync all categories (incl. 托业)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
