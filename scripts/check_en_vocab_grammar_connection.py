#!/usr/bin/env python3
"""回归：英语词库 connection 字段接线（对齐日语接续表展示）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def must_contain(path: str, needles: list[str], label: str) -> list[str]:
    text = read(path)
    missing = [n for n in needles if n not in text]
    if missing:
        return [f"{label}: missing {m!r} in {path}" for m in missing]
    return []


def main() -> int:
    errors: list[str] = []

    errors += must_contain(
        "src/lib/en-vocab-db/state.ts",
        ["EN_VOCAB_WORD_SCHEMA_VERSION = 5", "connection"],
        "schema version",
    )
    errors += must_contain(
        "src/lib/en-vocab-db/helpers.ts",
        [
            'addEnVocabWordColumnIfMissing(db, cols, "connection"',
            'addEnVocabWordColumnIfMissing(db, cols, "connection_source"',
            "connection, connection_source, example_sentences",
            "row.connection",
        ],
        "helpers",
    )
    errors += must_contain(
        "src/lib/en-vocab-db/notes_fields.ts",
        ["connection?: string | null", "connection = ?13", "connection_source"],
        "notes_fields",
    )
    errors += must_contain(
        "src/lib/en-vocab-db/share.ts",
        ["w.connection, w.connection_source", "connection: row.connection"],
        "share",
    )
    errors += must_contain(
        "src/lib/en-vocab-db/live.ts",
        ["connection, connection_source"],
        "live",
    )
    errors += must_contain(
        "src/app/api/en-vocab/edit/route.ts",
        ["connection?: string | null", "connection: body.connection"],
        "edit API",
    )
    errors += must_contain(
        "src/components/EnVocabEditModal.tsx",
        ["en-vocab-edit-connection", "connection: nextConnection"],
        "edit modal",
    )
    errors += must_contain(
        "src/components/EnVocabUsageExamplesPairedContent.tsx",
        [
            "JpVocabConnectionBody",
            "parseJpVocabConnectionDisplayParts",
            "connectionSource",
            "connectionTextFor",
        ],
        "paired content",
    )
    errors += must_contain(
        "src/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageBody.tsx",
        ["connection={w.connection}", "connectionSource={w.connection_source}"],
        "flashcard",
    )
    errors += must_contain(
        "src/components/EnVocabUsageViewModal.tsx",
        ["connection={word.connection}"],
        "view modal",
    )

    # 展示层复用日语表解析：标本公式须含「＋」与「｜」
    sample = (
        "用法1: 主语＋have/has＋规则过去分词（原形＋ed）｜如 finish→finished；"
        "主语＋have/has＋不规则过去分词｜如 go→gone\n"
        "用法2: 主语＋have/has＋过去分词＋for＋时间段｜从过去持续到现在"
    )
    if "＋" not in sample or "｜" not in sample or not re.search(r"用法\s*1\s*:", sample):
        errors.append("sample connection format self-check failed")

    if errors:
        print("FAIL: en-vocab grammar connection")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: en-vocab grammar connection wiring")
    return 0


if __name__ == "__main__":
    sys.exit(main())
