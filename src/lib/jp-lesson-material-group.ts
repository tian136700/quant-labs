import "server-only";

/**
 * 日语新课「同一张教案教材」组：批量挂图写入同一 material_group_id；
 * 标已完成时按组级联（每课仍各自 ref_key=lesson-{id}，随手画不拆）。
 */

import {
  ensureJpLessonSchemaColumns,
  getJpLessonById,
  isJpLessonDevStoreEnabled,
  listJpLessons,
  replaceJpLessonDevStoreRecord,
  updateJpLessonProgress,
  type UpdateJpLessonProgressResult,
} from "@/lib/jp-lesson-db";
import {
  getJpLessonProgressStatus,
  type JpLessonProgressStatus,
} from "@/lib/jp-lesson-shared";
import type { JpLessonVocabSyncPlan } from "@/lib/jp-lesson-vocab-sync-shared";
import type { JpLessonRecord } from "@/lib/types";

export function newJpLessonMaterialGroupId(): string {
  return `mg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listJpLessonsByMaterialGroup(
  db: D1Database,
  materialGroupId: string
): Promise<JpLessonRecord[]> {
  const gid = String(materialGroupId || "").trim();
  if (!gid) return [];

  await ensureJpLessonSchemaColumns(db);

  if (isJpLessonDevStoreEnabled()) {
    const all = await listJpLessons(db);
    return all
      .filter((l) => (l.material_group_id || "").trim() === gid)
      .sort((a, b) => a.id - b.id);
  }

  const rows = await db
    .prepare(
      `SELECT id FROM jp_lesson WHERE material_group_id = ?1 ORDER BY id ASC`
    )
    .bind(gid)
    .all<{ id: number }>();

  const out: JpLessonRecord[] = [];
  for (const row of rows.results || []) {
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const lesson = await getJpLessonById(db, id);
    if (lesson) out.push(lesson);
  }
  return out;
}

/** 把若干课写入同一教材组（覆盖原 group）。 */
export async function assignJpLessonsMaterialGroup(
  db: D1Database,
  lessonIds: number[],
  materialGroupId: string
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const gid = String(materialGroupId || "").trim();
  if (!gid) return { ok: false, error: "material_group_id_invalid" };

  const ids = [
    ...new Set(
      lessonIds
        .map((id) => Math.floor(Number(id)))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (!ids.length) return { ok: false, error: "lesson_ids_empty" };

  await ensureJpLessonSchemaColumns(db);

  if (isJpLessonDevStoreEnabled()) {
    let updated = 0;
    for (const id of ids) {
      const lesson = await getJpLessonById(db, id);
      if (!lesson) continue;
      replaceJpLessonDevStoreRecord({
        ...lesson,
        material_group_id: gid,
      });
      updated += 1;
    }
    return { ok: true, updated };
  }

  const placeholders = ids.map((_, i) => `?${i + 2}`).join(", ");
  const result = await db
    .prepare(
      `UPDATE jp_lesson SET material_group_id = ?1, updated_at = datetime('now')
       WHERE id IN (${placeholders})`
    )
    .bind(gid, ...ids)
    .run();

  return { ok: true, updated: Number(result.meta?.changes || 0) };
}

export type JpLessonMaterialGroupVocabSync = {
  lesson_id: number;
  vocab_sync: JpLessonVocabSyncPlan | null;
};

export type UpdateJpLessonProgressWithMaterialGroupResult =
  | {
      ok: true;
      lesson: JpLessonRecord;
      lessons: JpLessonRecord[];
      vocab_sync: JpLessonVocabSyncPlan | null;
      vocab_syncs: JpLessonMaterialGroupVocabSync[];
      sibling_lesson_ids: number[];
    }
  | { ok: false; error: string };

/**
 * 标已完成：同 material_group_id 下未完成课一并完成，并返回多课 vocab_sync。
 * 非 completed / 无组号 → 行为与单课 updateJpLessonProgress 一致。
 * 任一同组失败 → 回滚本请求已改进度的课。
 */
export async function updateJpLessonProgressWithMaterialGroup(
  db: D1Database,
  lessonId: number,
  progressStatus: JpLessonProgressStatus,
  operatorUsername: string
): Promise<UpdateJpLessonProgressWithMaterialGroupResult> {
  const beforePrimary = await getJpLessonById(db, lessonId);
  if (!beforePrimary) {
    return { ok: false, error: "not_found" };
  }
  const primaryPrevious = getJpLessonProgressStatus(beforePrimary);

  const primary = await updateJpLessonProgress(
    db,
    lessonId,
    progressStatus,
    operatorUsername
  );
  if (!primary.ok) {
    return { ok: false, error: primary.error };
  }

  const wrapSingle = (
    result: Extract<UpdateJpLessonProgressResult, { ok: true }>
  ): UpdateJpLessonProgressWithMaterialGroupResult => ({
    ok: true,
    lesson: result.lesson,
    lessons: [result.lesson],
    vocab_sync: result.vocab_sync ?? null,
    vocab_syncs: [
      {
        lesson_id: result.lesson.id,
        vocab_sync: result.vocab_sync ?? null,
      },
    ],
    sibling_lesson_ids: [result.lesson.id],
  });

  if (progressStatus !== "completed") {
    return wrapSingle(primary);
  }

  const gid = (primary.lesson.material_group_id || "").trim();
  if (!gid) {
    return wrapSingle(primary);
  }

  const siblings = await listJpLessonsByMaterialGroup(db, gid);
  const lessons: JpLessonRecord[] = [primary.lesson];
  const vocab_syncs: JpLessonMaterialGroupVocabSync[] = [
    {
      lesson_id: primary.lesson.id,
      vocab_sync: primary.vocab_sync ?? null,
    },
  ];
  const sibling_lesson_ids: number[] = [primary.lesson.id];
  const completedNow: Array<{
    id: number;
    previous: JpLessonProgressStatus;
  }> = [{ id: primary.lesson.id, previous: primaryPrevious }];

  const rollback = async () => {
    for (const item of completedNow.slice().reverse()) {
      await updateJpLessonProgress(
        db,
        item.id,
        item.previous,
        operatorUsername
      );
    }
  };

  for (const sib of siblings) {
    if (sib.id === primary.lesson.id) continue;
    if (sib.completed) continue;
    const previous = getJpLessonProgressStatus(sib);
    const r = await updateJpLessonProgress(
      db,
      sib.id,
      "completed",
      operatorUsername
    );
    if (!r.ok) {
      await rollback();
      return { ok: false, error: r.error };
    }
    lessons.push(r.lesson);
    sibling_lesson_ids.push(r.lesson.id);
    vocab_syncs.push({
      lesson_id: r.lesson.id,
      vocab_sync: r.vocab_sync ?? null,
    });
    completedNow.push({ id: r.lesson.id, previous });
  }

  return {
    ok: true,
    lesson: primary.lesson,
    lessons,
    vocab_sync: primary.vocab_sync ?? null,
    vocab_syncs,
    sibling_lesson_ids,
  };
}
