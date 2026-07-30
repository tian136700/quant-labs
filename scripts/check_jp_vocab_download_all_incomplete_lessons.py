#!/usr/bin/env python3
"""回归：download-all / exists 合并「学习中+未完成」新课单词，语法不合并新课。"""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def must_contain(path: pathlib.Path, needle: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle not in text:
        raise SystemExit(f"FAIL {label}: missing {needle!r} in {path.relative_to(ROOT)}")


def must_not_contain(path: pathlib.Path, needle: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if needle in text:
        raise SystemExit(f"FAIL {label}: unexpected {needle!r} in {path.relative_to(ROOT)}")


def main() -> int:
    lesson = ROOT / "src/lib/jp-lesson-incomplete-word-lemmas.ts"
    must_contain(lesson, "completed = 0", "incomplete lessons only")
    must_contain(lesson, 'lessonKind === "grammar"', "skip pure grammar lessons")
    must_contain(lesson, '!== "word"', "skip grammar items in mixed lessons")
    must_contain(lesson, "resolveJpLessonItemKinds", "split word_grammar")

    export_f = ROOT / "src/lib/jp-vocab-db/export_lemmas.ts"
    must_contain(export_f, "listIncompleteJpLessonWordLemmas", "merge incomplete lesson words")
    must_contain(export_f, 'kind === "grammar"', "grammar path skips lessons")
    must_contain(export_f, "id: 0", "lesson-only words use id 0")

    exists = ROOT / "src/lib/jp-vocab-exists-lemma.ts"
    must_contain(exists, "incompleteJpLessonHasWordLemma", "exists checks incomplete lessons")
    must_contain(exists, 'kind === "grammar"', "exists grammar skips lessons")

    route_exists = ROOT / "src/app/api/jp-vocab/exists/route.ts"
    must_contain(
        route_exists,
        "existsJpVocabLemmaForExternalCompare",
        "exists route uses external compare helper",
    )

    docs = ROOT / "docs/jp-vocab-download-all-api.txt"
    must_contain(docs, "学习中", "download docs mention learning")
    must_contain(docs, "未完成", "download docs mention pending")
    must_contain(docs, "暂不", "download docs say grammar not merged from lessons")

    print("OK check_jp_vocab_download_all_incomplete_lessons")
    return 0


if __name__ == "__main__":
    sys.exit(main())
