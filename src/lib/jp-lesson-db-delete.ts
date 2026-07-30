import "server-only";

import {
  getJpLessonById,
  isJpLessonDevStoreEnabled,
  spliceJpLessonDevStore,
} from "@/lib/jp-lesson-db";
import { unsyncLessonFromVocab } from "@/lib/jp-lesson-vocab-unsync";

export type DeleteJpLessonResult = { ok: true } | { ok: false; error: string };

/**
 * 删除一条日语新课：已完成则先从抽问卸词；清笔记/老师/上课时间；无其它课引用时删教案 ref。
 */
export async function deleteJpLesson(
  db: D1Database,
  lessonId: number
): Promise<DeleteJpLessonResult> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const lesson = await getJpLessonById(db, lessonId);
  if (!lesson) return { ok: false, error: "not_found" };

  if (lesson.completed) {
    await unsyncLessonFromVocab(db, lesson);
  }

  const refKey = lesson.ref_key;

  if (isJpLessonDevStoreEnabled()) {
    if (!spliceJpLessonDevStore(lessonId)) {
      return { ok: false, error: "not_found" };
    }
    return { ok: true };
  }

  await db
    .prepare("DELETE FROM jp_lesson_note WHERE lesson_id = ?1")
    .bind(lessonId)
    .run();
  await db
    .prepare("DELETE FROM jp_lesson_teacher_link WHERE lesson_id = ?1")
    .bind(lessonId)
    .run();
  await db
    .prepare("DELETE FROM jp_lesson_class_schedule WHERE lesson_id = ?1")
    .bind(lessonId)
    .run();

  const result = await db
    .prepare("DELETE FROM jp_lesson WHERE id = ?1")
    .bind(lessonId)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };

  if (refKey) {
    const other = await db
      .prepare("SELECT 1 AS ok FROM jp_lesson WHERE ref_key = ?1 LIMIT 1")
      .bind(refKey)
      .first<{ ok: number }>();
    if (!other?.ok) {
      await db
        .prepare("DELETE FROM jp_vocab_ref WHERE ref_key = ?1")
        .bind(refKey)
        .run();
    }
  }

  return { ok: true };
}
