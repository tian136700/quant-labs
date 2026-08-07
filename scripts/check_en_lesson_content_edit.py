#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 英语新课 meanings 列 + POST update 整课本体编辑。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    db = (ROOT / "src/lib/en-lesson-db.ts").read_text(encoding="utf-8")
    if "ensureEnLessonMeaningsColumn" not in db:
        errors.append("en-lesson-db: must ensure meanings column")
    if "ADD COLUMN meanings TEXT" not in db:
        errors.append("en-lesson-db: must ALTER ADD meanings")
    if "SELECT id, kind, content, meanings," not in db.replace("\n", " "):
        if "content, meanings, category" not in db:
            errors.append("en-lesson-db: LESSON_SELECT must include meanings")
    if "meanings: null," in db and "normalizeLessonMeaningsForStorage" not in db:
        errors.append("en-lesson-db: must not hardcode meanings null without normalize")
    if "normalizeLessonMeaningsForStorage" not in db:
        errors.append("en-lesson-db: must normalize meanings on map/create")
    if "export async function enLessonContentExists" not in db:
        errors.append("en-lesson-db: enLessonContentExists must be exported (exclude id)")
    if "excludeLessonId" not in db:
        errors.append("en-lesson-db: content exists check must support excludeLessonId")

    content_db = (ROOT / "src/lib/en-lesson-db-content.ts").read_text(encoding="utf-8")
    if "updateEnLessonContentFields" not in content_db:
        errors.append("missing updateEnLessonContentFields")
    for needle in ("kind", "content", "meanings", "category", "remarks", "title"):
        if needle not in content_db:
            errors.append(f"updateEnLessonContentFields must handle {needle}")
    if "content_duplicate" not in content_db:
        errors.append("update must reject content_duplicate")

    route = (ROOT / "src/app/api/en-lesson/route.ts").read_text(encoding="utf-8")
    if 'action === "update"' not in route and "action === 'update'" not in route:
        errors.append('API must handle action "update"')
    if "updateEnLessonContentFields" not in route:
        errors.append("API update must call updateEnLessonContentFields")

    helper = (ROOT / "src/lib/en-lesson-create-with-file.ts").read_text(
        encoding="utf-8"
    )
    if "meanings" not in helper:
        errors.append("create-with-file must accept meanings")

    create_route = (ROOT / "src/app/api/en-lesson/create/route.ts").read_text(
        encoding="utf-8"
    )
    upload_route = (ROOT / "src/app/api/en-lesson/upload/route.ts").read_text(
        encoding="utf-8"
    )
    if "meanings" not in create_route:
        errors.append("create route JSON must accept meanings")
    if "meanings" not in upload_route:
        errors.append("upload route JSON must accept meanings")

    api_docs = (ROOT / "docs/en-lesson-api.txt").read_text(encoding="utf-8")
    if "update" not in api_docs or "meanings" not in api_docs:
        errors.append("docs/en-lesson-api.txt must document update + meanings")

    create_docs = (ROOT / "docs/en-lesson-create-api.txt").read_text(encoding="utf-8")
    if "meanings" not in create_docs:
        errors.append("docs/en-lesson-create-api.txt must document meanings")

    if errors:
        print("FAIL check_en_lesson_content_edit:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("OK check_en_lesson_content_edit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
