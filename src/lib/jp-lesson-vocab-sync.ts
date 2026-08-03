import "server-only";

/**
 * 日语新课「已完成」→ 抽问词库：分片同步（防 Worker 1102）。
 * 标已完成只改进度；词条由客户端循环 POST action=sync_to_vocab。
 */

import {
  alignLessonItemExampleSentences,
  alignLessonItemMeanings,
  parseLessonContent,
  resolveJpLessonItemKinds,
} from "@/lib/jp-lesson-shared";
import { alignLessonItemAnnotations } from "@/lib/jp-vocab-annotation";
import {
  syncLessonNotesToVocab,
  upsertJpVocabFromLesson,
  type JpVocabLessonUpsertItem,
} from "@/lib/jp-vocab-db";
import type { JpLessonRecord, JpVocabRefUploadInput } from "@/lib/types";
import {
  JP_LESSON_VOCAB_SYNC_CHUNK_SIZE,
  type JpLessonVocabSyncPlan,
} from "@/lib/jp-lesson-vocab-sync-shared";

export {
  JP_LESSON_VOCAB_SYNC_CHUNK_SIZE,
  type JpLessonVocabSyncPlan,
} from "@/lib/jp-lesson-vocab-sync-shared";

export type JpLessonVocabSyncChunkResult =
  | {
      ok: true;
      lesson_id: number;
      total: number;
      offset: number;
      processed: number;
      next_offset: number;
      done: boolean;
      inserted: number;
      updated: number;
    }
  | { ok: false; error: string };

export function buildJpLessonVocabSyncPlan(
  lesson: JpLessonRecord
): JpLessonVocabSyncPlan | null {
  const total = parseLessonContent(lesson.content).length;
  if (!total) return null;
  return {
    needed: true,
    total,
    offset: 0,
    chunk_size: JP_LESSON_VOCAB_SYNC_CHUNK_SIZE,
  };
}

function buildJpLessonVocabUpsertItems(lesson: JpLessonRecord): {
  items: JpVocabLessonUpsertItem[];
  refs: JpVocabRefUploadInput[];
} {
  const words = parseLessonContent(lesson.content);
  const itemExamples = alignLessonItemExampleSentences(
    lesson.content,
    lesson.example_sentences
  );
  const itemMeanings = alignLessonItemMeanings(lesson.content, lesson.meanings);
  const itemAnnotations = alignLessonItemAnnotations(
    lesson.content,
    lesson.annotations
  );
  const itemKinds = resolveJpLessonItemKinds(
    lesson.kind,
    words.length,
    lesson.grammar_item_count
  );
  const refKey = lesson.ref_key;
  const refs: JpVocabRefUploadInput[] = refKey
    ? [
        {
          ref_key: refKey,
          title: lesson.title,
          media_type: "image",
        },
      ]
    : [];
  const courseLabel =
    (lesson.course_label || lesson.title || "").trim().slice(0, 120) || null;

  const items = words.map((word, index) => {
    const kind = itemKinds[index] ?? "word";
    return {
      word,
      kind,
      ref_key: refKey,
      meaning: kind === "grammar" ? (itemMeanings[index] ?? null) : null,
      example_sentences: itemExamples[index] ?? null,
      annotation: itemAnnotations[index] ?? null,
      course_label: courseLabel,
    };
  });

  return { items, refs };
}

/**
 * 同步一课的一小片词条到 jp_vocab。须 lesson.completed。
 * 最后一片顺带 sync 课堂笔记（无笔记则立即返回）。
 */
export async function syncJpLessonRecordToVocabChunk(
  db: D1Database,
  lesson: JpLessonRecord,
  offsetInput: number,
  limitInput: number = JP_LESSON_VOCAB_SYNC_CHUNK_SIZE
): Promise<JpLessonVocabSyncChunkResult> {
  if (!lesson.completed) {
    return { ok: false, error: "lesson_not_completed" };
  }

  const offset = Math.max(0, Math.floor(Number(offsetInput) || 0));
  const limit = Math.min(
    20,
    Math.max(1, Math.floor(Number(limitInput) || JP_LESSON_VOCAB_SYNC_CHUNK_SIZE))
  );

  const { items, refs } = buildJpLessonVocabUpsertItems(lesson);
  const total = items.length;
  const lessonId = lesson.id;

  if (!total) {
    return {
      ok: true,
      lesson_id: lessonId,
      total: 0,
      offset: 0,
      processed: 0,
      next_offset: 0,
      done: true,
      inserted: 0,
      updated: 0,
    };
  }

  if (offset >= total) {
    await syncLessonNotesToVocab(db, lesson);
    return {
      ok: true,
      lesson_id: lessonId,
      total,
      offset,
      processed: 0,
      next_offset: total,
      done: true,
      inserted: 0,
      updated: 0,
    };
  }

  const result = await upsertJpVocabFromLesson(db, items, refs, {
    offset,
    limit,
    upsertRefs: offset === 0,
  });

  const nextOffset = Math.min(total, offset + result.processed);
  const done = nextOffset >= total;
  if (done) {
    await syncLessonNotesToVocab(db, lesson);
  }

  return {
    ok: true,
    lesson_id: lessonId,
    total,
    offset,
    processed: result.processed,
    next_offset: nextOffset,
    done,
    inserted: result.inserted,
    updated: result.updated,
  };
}
