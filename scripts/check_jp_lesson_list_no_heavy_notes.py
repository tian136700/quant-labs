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
    if "listJpVocabWordsForPool" not in words:
        errors.append("words must export listJpVocabWordsForPool")
    if "listJpVocabWordsForPool" not in review:
        errors.append("rematerialize must use listJpVocabWordsForPool")
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
