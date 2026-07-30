#!/usr/bin/env python3
"""回归：日语词条/新课「标注」字段（口语常用 / 考试常用 / 口语考试都常用）。"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def must_contain(path: pathlib.Path, needle: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"FAIL {label}: missing {needle!r} in {path.relative_to(ROOT)}")


def main() -> int:
    ann = ROOT / "src/lib/jp-vocab-annotation.ts"
    must_contain(ann, "口语常用", "annotation values")
    must_contain(ann, "考试常用", "annotation values")
    must_contain(ann, "口语考试都常用", "annotation values")
    must_contain(ann, "normalizeLessonAnnotationsForStorage", "lesson normalize")

    helpers = ROOT / "src/lib/jp-vocab-db/helpers.ts"
    must_contain(helpers, "ADD COLUMN annotation", "vocab schema")
    must_contain(helpers, "annotation,", "WORD_SELECT")

    lesson_db = ROOT / "src/lib/jp-lesson-db.ts"
    must_contain(lesson_db, "ADD COLUMN annotations", "lesson schema")
    must_contain(lesson_db, "itemAnnotations", "sync to vocab")
    must_contain(lesson_db, "annotation: itemAnnotations", "sync field")

    upload = ROOT / "src/app/api/jp-lesson/upload/route.ts"
    must_contain(upload, "annotations", "upload API")

    upload_mixed = ROOT / "src/app/api/jp-lesson/upload-mixed/route.ts"
    must_contain(upload_mixed, "word_annotations", "upload-mixed API")
    must_contain(upload_mixed, "grammar_annotations", "upload-mixed API")

    flash = ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    must_contain(flash, "JpVocabAnnotationSection", "quiz card")

    review = ROOT / "src/components/JpVocabAdminReviewFlashcardModal.tsx"
    must_contain(review, "JpVocabAnnotationSection", "review card")

    table = ROOT / "src/components/jp-lesson-page/JpLessonStatusTable.tsx"
    must_contain(table, "JpLessonAnnotationsPreview", "lesson table")
    must_contain(table, "jp-lesson-annotations-col", "lesson column")

    share = ROOT / "src/lib/jp-vocab-db/share.ts"
    must_contain(share, "w.annotation", "shared list")

    live = ROOT / "src/lib/jp-vocab-db/live_rollover.ts"
    must_contain(live, "annotation,", "peek SELECT")

    # 抽查卡：标注必须在备注 section 之后（备注下面）
    flash_text = flash.read_text(encoding="utf-8")
    notes_idx = flash_text.find("jp-vocab-teacher-quiz__notes")
    ann_idx = flash_text.find("<JpVocabAnnotationSection")
    if notes_idx < 0 or ann_idx < 0 or ann_idx < notes_idx:
        raise SystemExit(
            "FAIL quiz card: JpVocabAnnotationSection must appear after notes section"
        )

    print("OK jp-vocab / jp-lesson annotation field")
    return 0


if __name__ == "__main__":
    sys.exit(main())
