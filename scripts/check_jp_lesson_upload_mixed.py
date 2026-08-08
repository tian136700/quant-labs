#!/usr/bin/env python3
"""Regression: jp-lesson upload-mixed creates two lessons + course_label column."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    route = ROOT / "src/app/api/jp-lesson/upload-mixed/route.ts"
    route_text = route.read_text(encoding="utf-8") if route.is_file() else ""
    if not route.is_file():
        errors.append("missing upload-mixed/route.ts")
    if "createJpLessonMixed" not in route_text:
        errors.append("upload-mixed must call createJpLessonMixed")
    if "word_content" not in route_text or "grammar_content" not in route_text:
        errors.append("upload-mixed must accept word_content + grammar_content")
    if "course_label" not in route_text:
        errors.append("upload-mixed must require/accept course_label")
    if "word_file" not in route_text or "grammar_file" not in route_text:
        errors.append("upload-mixed must accept word_file + grammar_file")
    if 'kind: "word_grammar"' in route_text or "单词加语法" in route_text:
        errors.append(
            "upload-mixed must NOT return kind=word_grammar / 单词加语法 "
            "(split into word + grammar rows instead)"
        )

    lesson_db = ROOT / "src/lib/jp-lesson-db.ts"
    lesson_text = lesson_db.read_text(encoding="utf-8") if lesson_db.is_file() else ""
    if "export async function createJpLessonMixed" not in lesson_text:
        errors.append("jp-lesson-db.ts: missing createJpLessonMixed")
    if 'kind: "word"' not in lesson_text or 'kind: "grammar"' not in lesson_text:
        errors.append("createJpLessonMixed must create kind=word and kind=grammar")
    if "course_label" not in lesson_text or "course_group_id" not in lesson_text:
        errors.append("jp-lesson-db must persist course_label + course_group_id")
    if "use_upload_mixed" not in lesson_text:
        errors.append("createJpLesson must reject word_grammar with use_upload_mixed")
    if 'const kind: JpLessonKind = "word_grammar"' in lesson_text:
        errors.append("createJpLessonMixed must not insert kind=word_grammar anymore")

    types = ROOT / "src/lib/types.ts"
    types_text = types.read_text(encoding="utf-8") if types.is_file() else ""
    if "course_label" not in types_text or "course_group_id" not in types_text:
        errors.append("types.ts: JpLessonRecord must include course_label + course_group_id")
    if "JpLessonMixedUploadInput" not in types_text:
        errors.append("types.ts: missing JpLessonMixedUploadInput")

    table = ROOT / "src/components/jp-lesson-page/JpLessonStatusTable.tsx"
    table_text = table.read_text(encoding="utf-8") if table.is_file() else ""
    if "jp-lesson-course-col" not in table_text:
        errors.append("JpLessonStatusTable must render 教材 column")
    if "course_label" not in table_text:
        errors.append("JpLessonStatusTable must show lesson.course_label")
    if "jp-lesson-course-label--has-ref" not in table_text:
        errors.append(
            "JpLessonStatusTable must mark course_label when lesson.ref_key (教案) exists"
        )

    styles = ROOT / "src/components/jp-lesson-page/JpLessonPageStyles.tsx"
    styles_text = styles.read_text(encoding="utf-8") if styles.is_file() else ""
    if "jp-lesson-course-label--has-ref" not in styles_text:
        errors.append("JpLessonPageStyles must color .jp-lesson-course-label--has-ref")

    docs = ROOT / "docs/jp-lesson-upload-mixed-api.txt"
    if not docs.is_file():
        errors.append("missing docs/jp-lesson-upload-mixed-api.txt")
    else:
        doc_text = docs.read_text(encoding="utf-8")
        if "/api/jp-lesson/upload-mixed" not in doc_text:
            errors.append("docs must document /api/jp-lesson/upload-mixed")
        if "course_label" not in doc_text or "标日" not in doc_text:
            errors.append("docs must document course_label (e.g. 标日23课)")
        if "word_file" not in doc_text:
            errors.append("docs must document word_file + grammar_file")

    rule = ROOT / ".cursor/rules/jp-lesson-upload-mixed.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-lesson-upload-mixed.mdc")
    else:
        rule_text = rule.read_text(encoding="utf-8")
        if "course_label" not in rule_text:
            errors.append("rule must mention course_label")

    if errors:
        print("FAIL: jp-lesson upload-mixed guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("ok: jp-lesson upload-mixed (two rows + course_label)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
