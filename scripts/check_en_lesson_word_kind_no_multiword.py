#!/usr/bin/env python3
"""Regression: en-lesson must NOT reject word-kind multi-word items on complete."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

FORBIDDEN = [
    "validateEnLessonWordKindContentForComplete",
    "word_kind_has_multi_word_items",
    "listEnLessonMultiWordItemsForWordKind",
    "countEnLessonContentItemWordTokens",
    "单词类新课的学习内容不能含多个英文词",
]


def main() -> int:
    errors: list[str] = []

    for rel in [
        "src/lib/en-lesson-shared.ts",
        "src/lib/en-lesson-db.ts",
        "src/components/EnLessonPage.tsx",
    ]:
        path = ROOT / rel
        text = path.read_text(encoding="utf-8") if path.is_file() else ""
        for n in FORBIDDEN:
            if n in text:
                errors.append(f"{rel}: must not contain {n!r}")

    rule = ROOT / ".cursor/rules/en-lesson-word-kind-no-multiword.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/en-lesson-word-kind-no-multiword.mdc")
    else:
        rule_text = rule.read_text(encoding="utf-8")
        if "允许多词" not in rule_text and "勿再拦" not in rule_text:
            errors.append("rule must document that multi-word word-kind is allowed")
        if "validateEnLessonWordKindContentForComplete(…)" in rule_text and "❌" not in rule_text:
            errors.append("rule must mark old validate helper as forbidden")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("OK: en-lesson allows word-kind multi-word items on complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
