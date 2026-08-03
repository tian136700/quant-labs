#!/usr/bin/env python3
"""回归：新课同步ます→辞书形；抽问已有则跳过并写备注。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    conv = (ROOT / "src/lib/jp-verb-masu-to-dictionary.ts").read_text(encoding="utf-8")
    sync = (ROOT / "src/lib/jp-lesson-vocab-sync.ts").read_text(encoding="utf-8")
    lesson_db = (ROOT / "src/lib/jp-vocab-db/lesson.ts").read_text(encoding="utf-8")
    note_db = (ROOT / "src/lib/jp-lesson-note-db.ts").read_text(encoding="utf-8")
    modal = (ROOT / "src/components/JpLessonWordsViewModal.tsx").read_text(
        encoding="utf-8"
    )
    rule = ROOT / ".cursor/rules/jp-lesson-vocab-masu-dictionary.mdc"

    if "export function jpVerbMasuToDictionaryForm" not in conv:
        errors.append("missing jpVerbMasuToDictionaryForm")
    for sample in ("食べます", "行きます", "勉強します", "話します", "します"):
        if sample not in conv and sample not in sync:
            # 转换表或注释里应覆盖常见例；至少函数文件要有例外/说明
            pass
    if "食べます" not in conv and "食べる" not in conv:
        # 文件头注释应有例
        if "辞书形" not in conv:
            errors.append("converter should document 辞书形 / masu examples")

    if "jpVerbMasuToDictionaryForm" not in sync:
        errors.append("jp-lesson-vocab-sync must convert masu via jpVerbMasuToDictionaryForm")
    if "lesson_item_word" not in sync:
        errors.append("sync must pass lesson_item_word for skip notes")
    if "lessonId" not in sync:
        errors.append("sync must pass lessonId to upsert")

    if "ensureJpLessonVocabSkipNote" not in lesson_db:
        errors.append("upsert must call ensureJpLessonVocabSkipNote when word exists")
    if 'kind === "word"' not in lesson_db or "skipped" not in lesson_db:
        errors.append("word kind existing lemma must skip (not re-insert)")
    if "lesson_item_word" not in lesson_db:
        errors.append("JpVocabLessonUpsertItem must include lesson_item_word")

    if "ensureJpLessonVocabSkipNote" not in note_db:
        errors.append("jp-lesson-note-db must export ensureJpLessonVocabSkipNote")
    if "JP_LESSON_VOCAB_SKIP_NOTE_MARK" not in note_db:
        errors.append("skip note must use JP_LESSON_VOCAB_SKIP_NOTE_MARK for idempotency")

    if "jp-lesson-words-view-note" not in modal:
        errors.append("WordsViewModal must show skip notes under words")
    if "/api/jp-lesson/notes" not in modal:
        errors.append("WordsViewModal must fetch lesson notes")

    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-lesson-vocab-masu-dictionary.mdc")

    # 禁止同步仍原样入库ます形（builder 须改 word）
    builder = re.search(
        r"const items = words\.map\(\(word, index\) => \{([\s\S]*?)\n  \}\);",
        sync,
    )
    if not builder:
        errors.append("cannot find buildJpLessonVocabUpsertItems map body")
    else:
        body = builder.group(1)
        if "jpVerbMasuToDictionaryForm" not in body:
            errors.append("items map must call jpVerbMasuToDictionaryForm for words")
        if re.search(r"\bword,\s*\n\s*kind,", body) and "dictionary" not in body:
            errors.append("items map must not pass raw masu word as vocab lemma")

    if errors:
        print("check_jp_lesson_vocab_masu_to_dictionary FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_lesson_vocab_masu_to_dictionary OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
