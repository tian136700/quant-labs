import "server-only";

import {
  getJpLessonById,
  isJpLessonDevStoreEnabled,
  replaceJpLessonDevStoreRecord,
} from "@/lib/jp-lesson-db";
import {
  normalizeLessonExampleSentencesForStorage,
  normalizeLessonMeaningsForStorage,
  parseLessonContent,
} from "@/lib/jp-lesson-shared";
import { normalizeLessonAnnotationsForStorage } from "@/lib/jp-vocab-annotation";
import type { JpLessonRecord } from "@/lib/types";

export type UpdateJpLessonContentMeaningsResult =
  | { ok: true; lesson: JpLessonRecord }
  | {
      ok: false;
      error:
        | "lesson_id_invalid"
        | "not_found"
        | "content_empty"
        | "invalid_annotation";
    };

/**
 * 更新一课的学习内容 + 释义；按 content 项数重对齐 annotations / example_sentences。
 */
export async function updateJpLessonContentMeanings(
  db: D1Database,
  lessonId: number,
  contentRaw: string,
  meaningsRaw: string | null | undefined
): Promise<UpdateJpLessonContentMeaningsResult> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const items = parseLessonContent(contentRaw);
  if (!items.length) {
    return { ok: false, error: "content_empty" };
  }

  const existing = await getJpLessonById(db, lessonId);
  if (!existing) return { ok: false, error: "not_found" };

  const storedContent = items.join(", ");
  const meanings = normalizeLessonMeaningsForStorage(storedContent, meaningsRaw);
  const annotationsNorm = normalizeLessonAnnotationsForStorage(
    storedContent,
    existing.annotations
  );
  if (!annotationsNorm.ok) {
    return { ok: false, error: annotationsNorm.error };
  }
  const annotations = annotationsNorm.value;
  const exampleSentences = normalizeLessonExampleSentencesForStorage(
    storedContent,
    existing.example_sentences
  );
  const ts = new Date().toISOString();

  if (isJpLessonDevStoreEnabled()) {
    const next: JpLessonRecord = {
      ...existing,
      content: storedContent,
      meanings,
      annotations,
      example_sentences: exampleSentences,
      updated_at: ts,
    };
    if (!replaceJpLessonDevStoreRecord(next)) {
      return { ok: false, error: "not_found" };
    }
    const lesson = await getJpLessonById(db, lessonId);
    if (!lesson) return { ok: false, error: "not_found" };
    return { ok: true, lesson };
  }

  const result = await db
    .prepare(
      `UPDATE jp_lesson
       SET content = ?1,
           meanings = ?2,
           annotations = ?3,
           example_sentences = ?4,
           updated_at = ?5
       WHERE id = ?6`
    )
    .bind(
      storedContent,
      meanings,
      annotations,
      exampleSentences,
      ts,
      lessonId
    )
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const lesson = await getJpLessonById(db, lessonId);
  if (!lesson) return { ok: false, error: "not_found" };
  return { ok: true, lesson };
}
