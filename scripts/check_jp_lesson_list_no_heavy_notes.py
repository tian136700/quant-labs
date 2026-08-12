#!/usr/bin/env python3
"""回归：管理员 very rematerialize 与 jp-lesson GET 禁止扫大字段（防 1102）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    review = (ROOT / "src/lib/jp-vocab-db/review_record.ts").read_text(encoding="utf-8")
    helpers = (ROOT / "src/lib/jp-vocab-db/helpers.ts").read_text(encoding="utf-8")
    words = (ROOT / "src/lib/jp-vocab-db/words.ts").read_text(encoding="utf-8")
    route = (ROOT / "src/app/api/jp-lesson/route.ts").read_text(encoding="utf-8")
    notes_db = (ROOT / "src/lib/jp-lesson-note-db.ts").read_text(encoding="utf-8")

    if "WORD_SELECT_POOL" not in helpers:
        errors.append("helpers must define WORD_SELECT_POOL (no class_notes body)")
    # POOL 只留 skip/排序字段；扫 meaning/例句仍会在管理员勾 very 时 1102
    pool_match = re.search(
        r"export const WORD_SELECT_POOL = `([\s\S]*?)`;",
        helpers,
    )
    if not pool_match:
        errors.append("helpers WORD_SELECT_POOL definition not found")
    else:
        pool_sql = pool_match.group(1)
        for forbidden in (
            "class_notes",
            "example_sentences",
            "mnemonic",
            "usage",
            "connection",
            "related_compounds",
            "meaning",
            "reading",
            "annotation",
        ):
            if forbidden in pool_sql:
                errors.append(f"WORD_SELECT_POOL must not select {forbidden}")
    if "listJpVocabWordsForPool" not in words:
        errors.append("words must export listJpVocabWordsForPool")
    if "seedIfEmpty" in words.split("export async function listJpVocabWordsForPool")[1].split(
        "export async function "
    )[0]:
        # only flag if seedIfEmpty call remains inside listJpVocabWordsForPool body
        pool_fn = words.split("export async function listJpVocabWordsForPool", 1)[1]
        pool_body = pool_fn.split("\nexport async function ", 1)[0]
        if "seedIfEmpty(" in pool_body:
            errors.append("listJpVocabWordsForPool must not call seedIfEmpty (hot path)")
    if "listJpVocabWordsForPool" not in review:
        errors.append("rematerialize must use listJpVocabWordsForPool")
    if "seedIfEmpty(" in review:
        errors.append("recordJpVocabReview must not call seedIfEmpty (admin very 热路径)")
    if re.search(
        r"rematerializeJpVocabTeacherVisibleAfterAdminVerySkip[\s\S]*?listJpVocabWords\(",
        review,
    ):
        errors.append("rematerialize must NOT call full listJpVocabWords()")

    if "listJpLessonNoteCountsByLesson" not in notes_db:
        errors.append("must have listJpLessonNoteCountsByLesson (COUNT only)")
    if "listJpLessonNotes(env.DB)" in route or "listJpLessonNotes(" in route:
        errors.append("GET /api/jp-lesson must not call listJpLessonNotes (full body)")
    if "listJpLessonNoteCountsByLesson" not in route:
        errors.append("GET /api/jp-lesson must use listJpLessonNoteCountsByLesson")
    lesson_db = (ROOT / "src/lib/jp-lesson-db.ts").read_text(encoding="utf-8")
    if "PRAGMA table_info(jp_lesson)" not in lesson_db:
        errors.append(
            "jp-lesson-db ensureJpLessonSchemaColumns must PRAGMA table_info（冷启动勿 7 次失败 ALTER）"
        )
    if "jpLessonSchemaColumnsReady" not in lesson_db:
        errors.append("jp-lesson-db must cache schema ready after one PRAGMA pass")
    if "listJpLessonNotesByLessonId" not in notes_db:
        errors.append("must have listJpLessonNotesByLessonId for per-lesson bodies")
    notes_route = (
        ROOT / "src/app/api/jp-lesson/notes/route.ts"
    ).read_text(encoding="utf-8")
    if "export async function GET" not in notes_route:
        errors.append("GET /api/jp-lesson/notes must exist for per-lesson bodies")
    if "listJpLessonNotesByLessonId" not in notes_route:
        errors.append("notes GET must call listJpLessonNotesByLessonId")

    if errors:
        print("check_jp_lesson_list_no_heavy_notes FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_lesson_list_no_heavy_notes OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
