#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: D1 IN queries must chunk (≤100 binds); lesson meanings expand uses own class."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    helper = read("src/lib/d1-in-chunks.ts")
    if "D1_IN_CHUNK_SIZE" not in helper or "chunkIdsForD1In" not in helper:
        errors.append("src/lib/d1-in-chunks.ts missing chunk helper")
    if not re.search(r"D1_IN_CHUNK_SIZE\s*=\s*(\d+)", helper):
        errors.append("D1_IN_CHUNK_SIZE not set")
    else:
        n = int(re.search(r"D1_IN_CHUNK_SIZE\s*=\s*(\d+)", helper).group(1))
        if n < 1 or n > 100:
            errors.append(f"D1_IN_CHUNK_SIZE={n} must be 1..100")

    must_chunk = [
        "src/lib/jp-lesson-class-schedule-db.ts",
        "src/lib/jp-lesson-teacher-db.ts",
        "src/lib/en-lesson-class-schedule-db.ts",
        "src/lib/en-lesson-teacher-db.ts",
        "src/lib/ko-lesson-teacher-db.ts",
    ]
    for rel in must_chunk:
        text = read(rel)
        if "chunkIdsForD1In" not in text:
            errors.append(f"{rel}: must use chunkIdsForD1In")
        # bare bind(...lessonIds) / bind(...map.keys()) without chunk loop is banned
        if re.search(
            r"\.bind\(\.\.\.(?:lessonIds|map\.keys\(\))\)",
            text,
        ):
            errors.append(f"{rel}: still binds full lessonIds/map.keys() at once")

    meanings = read("src/components/jp-lesson-page/jp-lesson-page-helpers.tsx")
    if "jp-lesson-meanings-preview" not in meanings:
        errors.append("JpLessonMeaningsPreview must use jp-lesson-meanings-preview class")
    if "展开后" not in meanings and "收起" not in meanings:
        errors.append("meanings/content preview should expose 收起")
    # expanded → button before lines
    if not re.search(
        r"expanded\s*\?\s*moreBtn[\s\S]{0,200}jp-lesson-meanings-lines",
        meanings,
    ):
        errors.append("expanded 收起 button should render above meanings lines")

    mobile = read("src/app/mobile/mobile-jp-lesson-cards.css")
    if "jp-lesson-meanings-preview" not in mobile:
        errors.append("mobile CSS must show meanings-preview (not hide with content-preview)")

    cache = read("src/lib/jp-api-cache.ts")
    if 'JP_LESSON_CACHE_KEY = "jp-api:lesson:v12"' not in cache:
        errors.append("JP_LESSON_CACHE_KEY should be bumped to v12 after list API fix")

    rule = ROOT / ".cursor/rules/d1-in-bind-limit.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/d1-in-bind-limit.mdc")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: d1-in-chunks + meanings expand guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
