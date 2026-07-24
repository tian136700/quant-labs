#!/usr/bin/env python3
"""Regression: en-lesson word-kind cannot complete with multi-word content items."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    shared = ROOT / "src/lib/en-lesson-shared.ts"
    text = shared.read_text(encoding="utf-8") if shared.is_file() else ""
    for n in [
        "export function countEnLessonContentItemWordTokens",
        "export function listEnLessonMultiWordItemsForWordKind",
        "export function validateEnLessonWordKindContentForComplete",
        "word_kind_has_multi_word_items",
        "单词类新课的学习内容不能含多个英文词",
    ]:
        if n not in text:
            errors.append(f"en-lesson-shared.ts: missing {n!r}")

    db = ROOT / "src/lib/en-lesson-db.ts"
    db_text = db.read_text(encoding="utf-8") if db.is_file() else ""
    if "validateEnLessonWordKindContentForComplete" not in db_text:
        errors.append("en-lesson-db.ts: must call validateEnLessonWordKindContentForComplete")
    if "completed && !before.completed" not in db_text:
        errors.append("en-lesson-db.ts: must gate check on newly completing")

    page = ROOT / "src/components/EnLessonPage.tsx"
    page_text = page.read_text(encoding="utf-8") if page.is_file() else ""
    if "validateEnLessonWordKindContentForComplete" not in page_text:
        errors.append("EnLessonPage.tsx: must pre-check before optimistic complete")
    if 'progressStatus === "completed"' not in page_text:
        errors.append("EnLessonPage.tsx: must only pre-check when marking completed")

    route = ROOT / "src/app/api/en-lesson/route.ts"
    route_text = route.read_text(encoding="utf-8") if route.is_file() else ""
    if "message: result.message" not in route_text and "result.message" not in route_text:
        errors.append("en-lesson/route.ts: must return message for multi-word reject")

    rule = ROOT / ".cursor/rules/en-lesson-word-kind-no-multiword.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/en-lesson-word-kind-no-multiword.mdc")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("OK: en-lesson word-kind rejects multi-word items on complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
