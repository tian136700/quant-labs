#!/usr/bin/env python3
"""回归：日语新课「已完成」须分片 sync_to_vocab，禁止单请求全量 upsert（防 1102）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    lesson_db = (ROOT / "src/lib/jp-lesson-db.ts").read_text(encoding="utf-8")
    vocab_lesson = (ROOT / "src/lib/jp-vocab-db/lesson.ts").read_text(encoding="utf-8")
    sync = (ROOT / "src/lib/jp-lesson-vocab-sync.ts").read_text(encoding="utf-8")
    shared = (ROOT / "src/lib/jp-lesson-vocab-sync-shared.ts").read_text(
        encoding="utf-8"
    )
    route = (ROOT / "src/app/api/jp-lesson/route.ts").read_text(encoding="utf-8")
    client = (
        ROOT / "src/components/jp-lesson-page/runJpLessonVocabSyncChunks.ts"
    ).read_text(encoding="utf-8")
    actions = (
        ROOT / "src/components/jp-lesson-page/useJpLessonPageActions.ts"
    ).read_text(encoding="utf-8")

    if "await syncLessonToVocab(" in lesson_db:
        errors.append(
            "jp-lesson-db must NOT call syncLessonToVocab inline on progress update"
        )
    if "buildJpLessonVocabSyncPlan" not in lesson_db:
        errors.append("updateJpLessonProgress must return buildJpLessonVocabSyncPlan")
    if 'action === "sync_to_vocab"' not in route and "action === 'sync_to_vocab'" not in route:
        errors.append("POST /api/jp-lesson must handle action sync_to_vocab")
    if "syncJpLessonRecordToVocabChunk" not in route:
        errors.append("route must call syncJpLessonRecordToVocabChunk")
    if "JP_LESSON_VOCAB_SYNC_CHUNK_SIZE" not in shared:
        errors.append("shared must define JP_LESSON_VOCAB_SYNC_CHUNK_SIZE")
    if "upsertJpVocabFromLesson" not in sync:
        errors.append("jp-lesson-vocab-sync must call upsertJpVocabFromLesson")
    if "offset" not in vocab_lesson or "UpsertJpVocabFromLessonOptions" not in vocab_lesson:
        errors.append("upsertJpVocabFromLesson must support offset/limit options")
    if "listJpVocabWordsForPool" in vocab_lesson and "appendJpVocabWordIdsToExistingDailyOrder" not in vocab_lesson:
        # allow mention in comment only
        body_without_comments = "\n".join(
            line
            for line in vocab_lesson.splitlines()
            if not line.strip().startswith("//") and "listJpVocabWordsForPool" in line
        )
        if "await listJpVocabWordsForPool" in vocab_lesson or "listJpVocabWordsForPool(db)" in body_without_comments:
            errors.append(
                "upsertJpVocabFromLesson must NOT call listJpVocabWordsForPool (1102)"
            )
    if "await listJpVocabWordsForPool" in vocab_lesson:
        errors.append(
            "upsertJpVocabFromLesson must NOT await listJpVocabWordsForPool"
        )
    if "if (!notes.length) return" not in vocab_lesson:
        errors.append("syncLessonNotesToVocab must early-return when no notes")
    if "runJpLessonVocabSyncChunks" not in client:
        errors.append("client helper runJpLessonVocabSyncChunks missing")
    if "runJpLessonVocabSyncChunks" not in actions:
        errors.append("useJpLessonPageActions must call runJpLessonVocabSyncChunks")
    if "sync_to_vocab" not in client:
        errors.append("client must POST action sync_to_vocab")

    if errors:
        print("check_jp_lesson_vocab_sync_chunked FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_lesson_vocab_sync_chunked OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
