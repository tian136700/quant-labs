#!/usr/bin/env python3
"""回归：新课→抽问 sync 不得把 PDF 教案 media_type 盖成 image。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    jp_shared = read("src/lib/jp-vocab-ref-shared.ts")
    en_shared = read("src/lib/en-vocab-ref-shared.ts")
    if "export function resolveJpVocabRefMediaType" not in jp_shared:
        errors.append("jp-vocab-ref-shared must export resolveJpVocabRefMediaType")
    if "export function resolveEnVocabRefMediaType" not in en_shared:
        errors.append("en-vocab-ref-shared must export resolveEnVocabRefMediaType")
    if "endsWith(\".pdf\")" not in jp_shared and "endsWith('.pdf')" not in jp_shared:
        errors.append("resolveJpVocabRefMediaType must trust r2_key .pdf")
    if "resolveJpVocabRefMediaType(base)" not in jp_shared:
        errors.append("resolveJpVocabRefForPreview must use resolveJpVocabRefMediaType")
    if "resolveEnVocabRefMediaType(base)" not in en_shared:
        errors.append("resolveEnVocabRefForPreview must use resolveEnVocabRefMediaType")

    jp_helpers = read("src/lib/jp-vocab-db/helpers.ts")
    en_helpers = read("src/lib/en-vocab-db/helpers.ts")
    for label, text, table in (
        ("jp", jp_helpers, "jp_vocab_ref"),
        ("en", en_helpers, "en_vocab_ref"),
    ):
        if "resolveJpVocabRefMediaType" not in text and label == "jp":
            errors.append("jp helpers mapRefRow must use resolveJpVocabRefMediaType")
        if "resolveEnVocabRefMediaType" not in text and label == "en":
            errors.append("en helpers mapRefRow must use resolveEnVocabRefMediaType")
        # metadata upsert ON CONFLICT must NOT overwrite media_type
        # Find upsertRefMetadataDb body: after INSERT into table … ON CONFLICT … before save*FileMeta
        m = re.search(
            rf"export async function upsertRefMetadataDb[\s\S]*?"
            rf"INSERT INTO {table}[\s\S]*?ON CONFLICT\(ref_key\) DO UPDATE SET([\s\S]*?)(?:\.bind|export async function)",
            text,
        )
        if not m:
            errors.append(f"{label}: upsertRefMetadataDb ON CONFLICT block not found")
        else:
            conflict = m.group(1)
            if re.search(r"media_type\s*=\s*excluded\.media_type", conflict):
                errors.append(
                    f"{label}: upsertRefMetadataDb must NOT set media_type = excluded.media_type"
                )

    sync = read("src/lib/jp-lesson-vocab-sync.ts")
    if 'media_type: "image"' in sync and "refMediaType" not in sync:
        errors.append("jp-lesson-vocab-sync must not hardcode media_type image without lookup")
    if "getJpVocabRef" not in sync:
        errors.append("jp-lesson-vocab-sync must look up existing ref media_type")
    if "resolveJpVocabRefMediaType" not in sync:
        errors.append("jp-lesson-vocab-sync must use resolveJpVocabRefMediaType")

    en_lesson = read("src/lib/en-lesson-db.ts")
    if 'media_type: "image" as const' in en_lesson:
        errors.append("en-lesson syncLessonToVocab must not hardcode media_type image")
    if "getEnVocabRef" not in en_lesson or "resolveEnVocabRefMediaType" not in en_lesson:
        errors.append("en-lesson sync must look up + resolve media_type")

    jp_route = read("src/app/api/jp-vocab/ref/[refKey]/route.ts")
    en_route = read("src/app/api/en-vocab/ref/[refKey]/route.ts")
    if "resolveJpVocabRefMediaType" not in jp_route:
        errors.append("jp ref API must resolve media_type from r2_key")
    if "resolveEnVocabRefMediaType" not in en_route:
        errors.append("en ref API must resolve media_type from r2_key")

    rule = ROOT / ".cursor/rules/vocab-ref-media-type-preserve.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/vocab-ref-media-type-preserve.mdc")

    if errors:
        print("check_vocab_ref_media_type_preserve FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_vocab_ref_media_type_preserve: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
