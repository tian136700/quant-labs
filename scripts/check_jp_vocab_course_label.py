#!/usr/bin/env python3
"""Regression: jp_vocab course_label sync + flashcard placement (备注后)."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    types = (ROOT / "src/lib/types.ts").read_text(encoding="utf-8")
    if "course_label?: string | null" not in types and "course_label:" not in types:
        errors.append("types.ts: JpVocabWord must include course_label")

    helpers = (ROOT / "src/lib/jp-vocab-db/helpers.ts").read_text(encoding="utf-8")
    if "course_label" not in helpers or "ADD COLUMN course_label" not in helpers:
        errors.append("helpers.ts: must map + ensure course_label column")
    if ", course_label," not in helpers and "course_label, oral_frequency" not in helpers:
        if "course_label" not in helpers.split("WORD_SELECT", 1)[-1][:800]:
            errors.append("helpers.ts: WORD_SELECT must include course_label")

    lesson_sync = (ROOT / "src/lib/jp-lesson-db.ts").read_text(encoding="utf-8")
    if "course_label: courseLabel" not in lesson_sync:
        errors.append("jp-lesson-db syncLessonToVocab must pass course_label")

    vocab_lesson = (ROOT / "src/lib/jp-vocab-db/lesson.ts").read_text(encoding="utf-8")
    if "course_label" not in vocab_lesson:
        errors.append("jp-vocab-db/lesson.ts must upsert course_label")

    share = (ROOT / "src/lib/jp-vocab-db/share.ts").read_text(encoding="utf-8")
    if "w.course_label" not in share:
        errors.append("share.ts SELECT must include w.course_label for student cards")

    meta = ROOT / "src/components/JpVocabCourseFreqMetaSection.tsx"
    if not meta.is_file():
        errors.append("missing JpVocabCourseFreqMetaSection.tsx (课数展示入口)")
    else:
        sec = meta.read_text(encoding="utf-8")
        if "courseLabel" not in sec:
            errors.append("CourseFreqMetaSection must accept courseLabel")

    for name in (
        "JpVocabTeacherQuizFlashcardModal.tsx",
        "JpVocabAdminReviewFlashcardModal.tsx",
    ):
        path = ROOT / "src/components" / name
        text = path.read_text(encoding="utf-8") if path.is_file() else ""
        if "JpVocabCourseFreqMetaSection" not in text:
            errors.append(f"{name}: must render JpVocabCourseFreqMetaSection for 课数")
        notes_i = text.find('className="jp-vocab-teacher-quiz__notes"')
        course_i = text.find("<JpVocabCourseFreqMetaSection")
        level_i = text.find('className="jp-vocab-teacher-quiz__level"')
        stats_i = text.find('className="jp-vocab-teacher-quiz__stats"')
        after = level_i if level_i >= 0 else stats_i
        if course_i < 0 or notes_i < 0 or after < 0:
            errors.append(f"{name}: could not locate notes/course/level-or-stats markers")
        elif not (notes_i < course_i < after):
            errors.append(
                f"{name}: 课数块须在备注之后、熟悉程度/统计之前"
            )

    rule = ROOT / ".cursor/rules/jp-vocab-course-label.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-vocab-course-label.mdc")

    if errors:
        print("FAIL: jp-vocab course_label")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("ok: jp-vocab course_label (sync + card after notes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
