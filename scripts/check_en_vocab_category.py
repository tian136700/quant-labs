#!/usr/bin/env python3
"""Regression: English vocab/lesson category tag is wired end-to-end."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def must_contain(path: Path, needle: str, label: str | None = None) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        fail(f"{label or path.relative_to(ROOT)} missing {needle!r}")


def main() -> None:
    must_contain(
        ROOT / "src/lib/en-vocab-category.ts",
        'EN_VOCAB_DEFAULT_CATEGORY = "雅思托福"',
    )
    must_contain(
        ROOT / "schema.sql",
        "category    TEXT    NOT NULL DEFAULT '雅思托福'",
    )
    must_contain(ROOT / "src/lib/en-lesson-db.ts", "ensureEnLessonCategoryColumn")
    must_contain(ROOT / "src/lib/en-lesson-db.ts", "category: lesson.category")
    must_contain(
        ROOT / "src/lib/en-lesson-db.ts",
        "INSERT INTO en_lesson (kind, content, category, title, ref_key",
    )
    must_contain(
        ROOT / "src/app/api/en-lesson/upload/route.ts",
        "categoryRaw",
    )
    must_contain(
        ROOT / "src/app/api/en-lesson/upload/route.ts",
        "normalizeEnVocabCategory",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/words.ts",
        "category: normalizeEnVocabCategory(w.category)",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/edit/route.ts",
        "category: body.category",
    )
    must_contain(
        ROOT / "src/components/en-vocab-page/EnVocabWordTable.tsx",
        'sortKey="category"',
    )
    must_contain(
        ROOT / "src/components/EnVocabEditModal.tsx",
        "en-vocab-edit-category",
    )
    must_contain(
        ROOT / "src/components/en-lesson-page/EnLessonStatusTable.tsx",
        "en-lesson-category-col",
    )
    print("OK: en-vocab / en-lesson category wiring")


if __name__ == "__main__":
    main()
