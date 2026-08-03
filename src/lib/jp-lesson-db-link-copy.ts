import "server-only";

import {
  getJpLessonById,
  isJpLessonDevStoreEnabled,
  replaceJpLessonDevStoreRecord,
} from "@/lib/jp-lesson-db";

export type IncrementJpLessonLinkCopyCountResult =
  | { ok: true; link_copy_count: number }
  | { ok: false; error: string };

export async function incrementJpLessonLinkCopyCount(
  db: D1Database,
  lessonId: number
): Promise<IncrementJpLessonLinkCopyCountResult> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const lesson = await getJpLessonById(db, lessonId);
  if (!lesson) return { ok: false, error: "not_found" };

  const next = (lesson.link_copy_count ?? 0) + 1;

  if (isJpLessonDevStoreEnabled()) {
    if (!replaceJpLessonDevStoreRecord({ ...lesson, link_copy_count: next })) {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, link_copy_count: next };
  }

  const ts = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE jp_lesson
       SET link_copy_count = COALESCE(link_copy_count, 0) + 1, updated_at = ?2
       WHERE id = ?1`
    )
    .bind(lessonId, ts)
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const row = await db
    .prepare(`SELECT link_copy_count FROM jp_lesson WHERE id = ?1`)
    .bind(lessonId)
    .first<{ link_copy_count: number | null }>();

  return { ok: true, link_copy_count: Number(row?.link_copy_count) || 0 };
}
