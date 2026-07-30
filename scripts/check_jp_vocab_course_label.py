#!/usr/bin/env python3
"""Regression: jp-vocab course_label sync from lesson + flashcard display."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    helpers = ROOT / "src/lib/jp-vocab-db/helpers.ts"
    h = helpers.read_text(encoding="utf-8") if helpers.is_file() else ""
    if "ADD COLUMN course_label" not in h:
        errors.append("helpers.ts: must add course_label column")
    if "course_label," not in h and "course_label " not in h:
        errors.append("helpers.ts: WORD_SELECT / mapRow must include course_label")

    lesson_sync = ROOT / "src/lib/jp-lesson-db.ts"
    ls = lesson_sync.read_text(encoding="utf-8") if lesson_sync.is_file() else ""
    if "course_label: courseLabel" not in ls:
        errors.append("jp-lesson-db syncLessonToVocab must pass course_label")

    upsert = ROOT / "src/lib/jp-vocab-db/lesson.ts"
    u = upsert.read_text(encoding="utf-8") if upsert.is_file() else ""
    if "course_label" not in u:
        errors.append("upsertJpVocabFromLesson must accept/write course_label")

    share = ROOT / "src/lib/jp-vocab-db/share.ts"
    s = share.read_text(encoding="utf-8") if share.is_file() else ""
    if "w.course_label" not in s:
        errors.append("shared list SELECT must include w.course_label")

    live = ROOT / "src/lib/jp-vocab-db/live_rollover.ts"
    lv = live.read_text(encoding="utf-8") if live.is_file() else ""
    if "course_label" not in lv:
        errors.append("peek/live word SELECT must include course_label")

    ui = ROOT / "src/components/JpVocabCourseLabelSection.tsx"
    if not ui.is_file():
        errors.append("missing JpVocabCourseLabelSection.tsx")
    quiz = ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    q = quiz.read_text(encoding="utf-8") if quiz.is_file() else ""
    if "JpVocabCourseLabelSection" not in q:
        errors.append("teacher quiz flashcard must render course label")
    # Must appear after annotation (偏后)
    if q.find("JpVocabAnnotationSection") > q.find("JpVocabCourseLabelSection"):
        errors.append("course label must be after annotation (偏后)")

    upload = ROOT / "src/app/api/jp-lesson/upload/route.ts"
    up = upload.read_text(encoding="utf-8") if upload.is_file() else ""
    if "course_label" not in up:
        errors.append("single upload API should accept course_label")

    if errors:
        print("FAIL: jp-vocab course_label")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("ok: jp-vocab course_label (sync + card)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
