#!/usr/bin/env python3
"""Regression: English vocab upload_source (上传类型) is wired end-to-end."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def must_contain(path: Path, needle: str, label: str | None = None) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        fail(f"{label or path.relative_to(ROOT)} missing {needle!r}")


def main() -> None:
    must_contain(
        ROOT / "src/lib/en-vocab-upload-source.ts",
        'EN_VOCAB_UPLOAD_SOURCE_LESSON = "en_lesson"',
    )
    must_contain(
        ROOT / "src/lib/en-vocab-upload-source.ts",
        'EN_VOCAB_UPLOAD_SOURCE_API = "api"',
    )
    must_contain(
        ROOT / "src/lib/en-vocab-upload-source.ts",
        "由英语新课模块同步",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-upload-source.ts",
        "通过API接口上传",
    )
    must_contain(
        ROOT / "schema.sql",
        "upload_source TEXT NOT NULL DEFAULT 'en_lesson'",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/state.ts",
        "EN_VOCAB_WORD_SCHEMA_VERSION = 4",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/helpers.ts",
        '"upload_source"',
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/helpers.ts",
        "SET upload_source = '${EN_VOCAB_UPLOAD_SOURCE_LESSON}'",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/lesson.ts",
        "EN_VOCAB_UPLOAD_SOURCE_LESSON",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/words.ts",
        "EN_VOCAB_UPLOAD_SOURCE_API",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/local-upload/route.ts",
        "EN_VOCAB_UPLOAD_SOURCE_API",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/local-upload/route.ts",
        "duplicate_words",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/local-upload/route.ts",
        "单词重复了，库中已存在，已跳过",
    )
    must_contain(
        ROOT / "src/lib/en-vocab-db/words.ts",
        "duplicate_words",
    )
    must_contain(
        ROOT / "docs/en-vocab-local-upload-api.txt",
        "POST https://english.info-quests.com/api/en-vocab/local-upload",
    )
    must_contain(
        ROOT / "src/app/api/en-vocab/upload/route.ts",
        "EN_VOCAB_UPLOAD_SOURCE_API",
    )
    must_contain(
        ROOT / "src/components/en-vocab-page/EnVocabWordTable.tsx",
        'sortKey="upload_source"',
    )
    must_contain(
        ROOT / "src/components/en-vocab-page/EnVocabWordTable.tsx",
        "displayEnVocabUploadSource",
    )
    print("OK: en-vocab upload_source wiring")


if __name__ == "__main__":
    main()
