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

    # 教案 ref 替换：updateJpVocabWordsRefKey 只认 JpVocabKind，禁止把 lesson.kind 直接传入
    ref_replace = ROOT / "src/app/api/jp-lesson/ref/replace/route.ts"
    ref_text = ref_replace.read_text(encoding="utf-8") if ref_replace.is_file() else ""
    if not ref_replace.is_file():
        errors.append("missing jp-lesson/ref/replace/route.ts")
    elif "resolveJpLessonItemKinds" not in ref_text:
        errors.append(
            "jp-lesson/ref/replace must use resolveJpLessonItemKinds "
            "(updateJpVocabWordsRefKey cannot take lesson.kind=word_grammar)"
        )
    elif "lesson.kind," in ref_text and "updateJpVocabWordsRefKey" in ref_text:
        # 粗检：调用块里不应再出现 lesson.kind 作为 kind 参数
        if "updateJpVocabWordsRefKey(\n" in ref_text.replace("\r\n", "\n"):
            block = ref_text.split("updateJpVocabWordsRefKey", 1)[-1][:400]
            if "lesson.kind" in block:
                errors.append(
                    "jp-lesson/ref/replace must not pass lesson.kind to updateJpVocabWordsRefKey"
                )

    types = ROOT / "src/lib/types.ts"
    types_text = types.read_text(encoding="utf-8") if types.is_file() else ""
    if '"word_grammar"' not in types_text:
        errors.append("types.ts: JpLessonKind must include word_grammar")
    if "JpLessonMixedUploadInput" not in types_text:
        errors.append("types.ts: missing JpLessonMixedUploadInput")
    # 英语新课不得跟日语合传 kind（否则 updateEnVocabWordsRefKey 类型炸、部署失败）
    if "export type EnLessonKind = JpLessonKind" in types_text:
        errors.append(
            "types.ts: EnLessonKind must stay word|grammar "
            "(do not alias JpLessonKind which includes word_grammar)"
        )
    if 'export type EnLessonKind = "word" | "grammar"' not in types_text:
        errors.append('types.ts: EnLessonKind must be "word" | "grammar"')

    shared = ROOT / "src/lib/jp-lesson-shared.ts"
    shared_text = shared.read_text(encoding="utf-8") if shared.is_file() else ""
    if "export function resolveJpLessonItemKinds" not in shared_text:
        errors.append("jp-lesson-shared.ts: missing resolveJpLessonItemKinds")
    if 'return "单词加语法"' not in shared_text:
        errors.append("jpLessonKindLabel must return 单词加语法")

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
