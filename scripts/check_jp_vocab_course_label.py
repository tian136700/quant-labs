#!/usr/bin/env python3
"""Regression: jp_vocab course_label sync + flashcard tag placement."""

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
    if "WORD_SELECT" in helpers and "course_label" not in helpers.split("WORD_SELECT", 1)[-1][:500]:
        # soft: WORD_SELECT line should include course_label
        if ", course_label," not in helpers and "course_label, example_sentences" not in helpers:
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

    section = ROOT / "src/components/JpVocabCourseLabelSection.tsx"
    if not section.is_file():
        errors.append("missing JpVocabCourseLabelSection.tsx")
    else:
        sec = section.read_text(encoding="utf-8")
        if "course-label-tag" not in sec:
            errors.append("CourseLabelSection should render a tag (弱标签)")

    for name in (
        "JpVocabTeacherQuizFlashcardModal.tsx",
        "JpVocabAdminReviewFlashcardModal.tsx",
    ):
        path = ROOT / "src/components" / name
        text = path.read_text(encoding="utf-8") if path.is_file() else ""
        if "JpVocabCourseLabelSection" not in text:
            errors.append(f"{name}: must render JpVocabCourseLabelSection")
        # Placement: after stats, before nav
        stats_i = text.find('className="jp-vocab-teacher-quiz__stats"')
        course_i = text.find("<JpVocabCourseLabelSection")
        nav_i = text.find('className="jp-vocab-teacher-quiz__nav"')
        if course_i < 0 or stats_i < 0 or nav_i < 0:
            errors.append(f"{name}: could not locate stats/course/nav markers")
        elif not (stats_i < course_i < nav_i):
            errors.append(
                f"{name}: CourseLabel must be after stats and before nav (靠后)"
            )

    rule = ROOT / ".cursor/rules/jp-vocab-course-label.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-vocab-course-label.mdc")

    if errors:
        print("FAIL: jp-vocab course_label")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("ok: jp-vocab course_label (sync + card tag)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
