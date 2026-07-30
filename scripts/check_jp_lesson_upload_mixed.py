#!/usr/bin/env python3
"""Regression: jp-lesson upload-mixed (word+grammar) + completed sync per-item kinds."""

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
    if "单词加语法" not in route_text:
        errors.append("upload-mixed response must label 单词加语法")

    lesson_db = ROOT / "src/lib/jp-lesson-db.ts"
    lesson_text = lesson_db.read_text(encoding="utf-8") if lesson_db.is_file() else ""
    if "export async function createJpLessonMixed" not in lesson_text:
        errors.append("jp-lesson-db.ts: missing createJpLessonMixed")
    if 'kind: JpLessonKind = "word_grammar"' not in lesson_text and (
        'const kind: JpLessonKind = "word_grammar"' not in lesson_text
    ):
        errors.append("createJpLessonMixed must store kind=word_grammar")
    if "grammar_item_count" not in lesson_text:
        errors.append("jp-lesson-db.ts: must persist grammar_item_count")
    if "use_upload_mixed" not in lesson_text:
        errors.append("createJpLesson must reject word_grammar with use_upload_mixed")
    if "resolveJpLessonItemKinds" not in lesson_text:
        errors.append("syncLessonToVocab must use resolveJpLessonItemKinds")
    if 'meaning: kind === "grammar"' not in lesson_text:
        errors.append("sync must gate meanings per item kind===grammar")

    shared = ROOT / "src/lib/jp-lesson-shared.ts"
    shared_text = shared.read_text(encoding="utf-8") if shared.is_file() else ""
    if "export function resolveJpLessonItemKinds" not in shared_text:
        errors.append("jp-lesson-shared.ts: missing resolveJpLessonItemKinds")
    if 'return "单词加语法"' not in shared_text:
        errors.append("jpLessonKindLabel must return 单词加语法")

    types = ROOT / "src/lib/types.ts"
    types_text = types.read_text(encoding="utf-8") if types.is_file() else ""
    if '"word_grammar"' not in types_text:
        errors.append("types.ts: JpLessonKind must include word_grammar")
    if "JpLessonMixedUploadInput" not in types_text:
        errors.append("types.ts: missing JpLessonMixedUploadInput")

    docs = ROOT / "docs/jp-lesson-upload-mixed-api.txt"
    if not docs.is_file():
        errors.append("missing docs/jp-lesson-upload-mixed-api.txt")
    else:
        doc_text = docs.read_text(encoding="utf-8")
        if "/api/jp-lesson/upload-mixed" not in doc_text:
            errors.append("docs must document /api/jp-lesson/upload-mixed")
        if "单词加语法" not in doc_text:
            errors.append("docs must mention 单词加语法")

    rule = ROOT / ".cursor/rules/jp-lesson-upload-mixed.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-lesson-upload-mixed.mdc")

    if errors:
        print("FAIL: jp-lesson upload-mixed guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("ok: jp-lesson upload-mixed (word+grammar)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
