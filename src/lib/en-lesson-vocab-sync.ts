import "server-only";

import type { EnLessonRecord } from "@/lib/types";
import { parseLessonContent } from "@/lib/en-lesson-shared";
import {
  normalizeEnVocabRefKey,
  resolveEnVocabRefMediaType,
} from "@/lib/en-vocab-ref-shared";
import { getEnVocabRef } from "@/lib/en-vocab-db/helpers";
import {
  syncLessonNotesToVocab,
  upsertEnVocabFromLesson,
} from "@/lib/en-vocab-db/lesson";
import { listEnVocabWordsForPool } from "@/lib/en-vocab-db/pool";
import { ensureEnVocabDailyDisplayOrder } from "@/lib/en-vocab-db/daily_settings";

/**
 * 英语新课「上课完」→ 抽查词库。
 * **所有分类一律同步**（雅思托福 / 托业 / IT面试 / 自由文本），禁止按分类跳过。
 */
export async function syncEnLessonToVocab(
  db: D1Database,
  lesson: EnLessonRecord
): Promise<{ itemCount: number }> {
  const items = parseLessonContent(lesson.content);
  if (!items.length) return { itemCount: 0 };

  const refKey = lesson.ref_key
    ? normalizeEnVocabRefKey(lesson.ref_key) || lesson.ref_key
    : null;
  let mediaType: "image" | "pdf" = "image";
  if (refKey) {
    const existingRef = await getEnVocabRef(db, refKey);
    if (existingRef) {
      mediaType = resolveEnVocabRefMediaType(existingRef);
    }
  }
  const refs = refKey
    ? [
        {
          ref_key: refKey,
          title: lesson.title,
          media_type: mediaType,
        },
      ]
    : [];

  await upsertEnVocabFromLesson(
    db,
    items.map((word) => ({
      word,
      kind: lesson.kind,
      ref_key: refKey,
      category: lesson.category,
    })),
    refs
  );
  await syncLessonNotesToVocab(db, lesson);
  return { itemCount: items.length };
}

export type BackfillEnLessonVocabResult = {
  scanned: number;
  synced: number;
  lessonIds: number[];
  remaining: number;
};

/**
 * 回填：已「上课完」但词条可能未进抽查的课（历史漏同步 / 中途失败）。
 * 每课调用 sync（upsert 幂等）；再 merge 日序，便于池能看见新词。
 * 限流：默认每次最多 `limit` 课，避免 Worker 1102。
 */
export async function backfillCompletedEnLessonsToVocab(
  db: D1Database,
  lessons: EnLessonRecord[],
  opts?: { limit?: number; offset?: number }
): Promise<BackfillEnLessonVocabResult> {
  const limit = Math.max(1, Math.min(20, Math.floor(opts?.limit ?? 8)));
  const offset = Math.max(0, Math.floor(opts?.offset ?? 0));
  const completed = lessons.filter((l) => l.completed);
  const slice = completed.slice(offset, offset + limit);
  const syncedIds: number[] = [];

  for (const lesson of slice) {
    await syncEnLessonToVocab(db, lesson);
    syncedIds.push(lesson.id);
  }

  if (syncedIds.length) {
    const words = await listEnVocabWordsForPool(db);
    await ensureEnVocabDailyDisplayOrder(db, words);
  }

  const remaining = Math.max(0, completed.length - (offset + slice.length));
  return {
    scanned: slice.length,
    synced: syncedIds.length,
    lessonIds: syncedIds,
    remaining,
  };
}
