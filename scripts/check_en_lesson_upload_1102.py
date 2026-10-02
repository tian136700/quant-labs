#!/usr/bin/env python3
"""Regression: 英语新课教案上传禁止全表 content 扫描 / 禁止 multipart 先 arrayBuffer（防 1102）."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DB = ROOT / "src/lib/en-lesson-db.ts"
HELPER = ROOT / "src/lib/en-lesson-create-with-file.ts"
REF_SERVER = ROOT / "src/lib/en-vocab-ref-server.ts"
REPLACE = ROOT / "src/app/api/en-lesson/ref/replace/route.ts"
CREATE = ROOT / "src/app/api/en-lesson/create/route.ts"
UPLOAD = ROOT / "src/app/api/en-lesson/upload/route.ts"


def main() -> int:
    errors: list[str] = []

    db = DB.read_text(encoding="utf-8")
    # 真正的全表扫是 prepare("SELECT id, content …")，注释里的禁止示例不算
    if 'prepare(\n        skipId == null\n        ? "SELECT id, content FROM en_lesson' in db or (
        '"SELECT id, content FROM en_lesson WHERE kind' in db
    ):
        errors.append(
            "en-lesson-db: enLessonContentExists must NOT SELECT id, content full table "
            "(Worker 1102 with lesson PDF upload)"
        )
    if "export async function enLessonContentExists" not in db:
        errors.append("en-lesson-db: missing enLessonContentExists")
    # category 列已存在时禁止再 TRIM 全表回填
    ensure_block_start = db.find("export async function ensureEnLessonSchemaColumns")
    if ensure_block_start < 0:
        errors.append("en-lesson-db: missing ensureEnLessonSchemaColumns")
    else:
        ensure_block = db[ensure_block_start : ensure_block_start + 1800]
        if (
            "列已在" in ensure_block
            and "TRIM(category)" in ensure_block
            and "禁止再跑全表" not in ensure_block
        ):
            errors.append(
                "ensureEnLessonSchemaColumns: must NOT TRIM-UPDATE category when column exists"
            )
        if "禁止再跑全表 TRIM UPDATE" not in ensure_block:
            errors.append(
                "ensureEnLessonSchemaColumns: must skip category backfill when column exists"
            )

    helper = HELPER.read_text(encoding="utf-8")
    if "file.arrayBuffer()" in helper or "await file.arrayBuffer()" in helper:
        errors.append(
            "en-lesson-create-with-file: must NOT arrayBuffer multipart file before R2 put"
        )
    if "fileBody = file" not in helper and "fileBody: file" not in helper:
        errors.append("en-lesson-create-with-file: must pass File as fileBody to R2")
    if "createEnLessonWithOptionalFile" not in helper:
        errors.append("helper: missing createEnLessonWithOptionalFile")

    ref_server = REF_SERVER.read_text(encoding="utf-8")
    if "EnVocabRefFileBody" not in ref_server:
        errors.append("en-vocab-ref-server: putEnVocabRefFile must accept Blob/File body")
    if "bytes: ArrayBuffer)" in ref_server and "EnVocabRefFileBody" not in ref_server:
        errors.append("putEnVocabRefFile still typed ArrayBuffer-only")

    replace = REPLACE.read_text(encoding="utf-8")
    if "file.arrayBuffer()" in replace:
        errors.append("en-lesson/ref/replace: must pass File to putEnVocabRefFile (no arrayBuffer)")

    for label, path in (("create", CREATE), ("upload", UPLOAD)):
        text = path.read_text(encoding="utf-8")
        if "createEnLessonWithOptionalFile" not in text:
            errors.append(f"{label}/route: must call createEnLessonWithOptionalFile")

    if errors:
        print("\n".join(errors))
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
