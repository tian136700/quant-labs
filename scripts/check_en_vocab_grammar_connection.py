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

    errors += must_contain(
        "src/lib/jp-vocab-connection-ai.ts",
        [
            "protectEnglishHaveHasSlash",
            "restoreEnglishHaveHasSlash",
            "\\uFFF0",
            "EN_HAVE_HAS_SLASH_TOKEN",
        ],
        "have/has slash protect",
    )
    errors += must_contain(
        "src/components/EnVocabUsageExamplesPairedContent.tsx",
        [
            "leftoverConnectionNotes",
            "en-usage-ex-paired-conn-note",
            # leftover 不得并进公式（；会打断上表）
            "不要并进公式正文",
        ],
        "leftover separate from table",
    )

    if errors:
        print("FAIL: en-vocab grammar connection")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: en-vocab grammar connection wiring")
    return 0


if __name__ == "__main__":
    sys.exit(main())
