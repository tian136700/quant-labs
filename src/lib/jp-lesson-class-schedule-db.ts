import "server-only";

import { normalizeClassDurationMinutes } from "@/lib/jp-lesson-shared";
import type { JpLessonClassSchedule, JpLessonClassScheduleInput } from "@/lib/types";

let devStoreEnabled = false;
const devSchedules = new Map<number, JpLessonClassSchedule[]>();
let devNextId = 1;

export function enableJpLessonClassScheduleDevStore() {
  devStoreEnabled = true;
}

function mapRow(row: Record<string, unknown>): JpLessonClassSchedule {
  return {
    id: Number(row.id),
    class_at: String(row.class_at).trim(),
    duration_minutes: normalizeClassDurationMinutes(
      row.duration_minutes != null ? Number(row.duration_minutes) : null
    ),
  };
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeClassAt(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return null;
  }
  return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
}

export function normalizeClassScheduleInputs(
  schedules: JpLessonClassScheduleInput[]
): { ok: true; schedules: JpLessonClassScheduleInput[] } | { ok: false; error: string } {
  const normalized: JpLessonClassScheduleInput[] = [];

  for (const item of schedules) {
    const classAt = normalizeClassAt(item.class_at);
    if (!classAt) {
      return { ok: false, error: "class_at_invalid" };
    }
    const durationMinutes = normalizeClassDurationMinutes(item.duration_minutes);
    if (item.duration_minutes != null && durationMinutes == null) {
      return { ok: false, error: "class_duration_minutes_invalid" };
    }
    normalized.push({ class_at: classAt, duration_minutes: durationMinutes });
  }

  normalized.sort((a, b) => a.class_at.localeCompare(b.class_at));
  return { ok: true, schedules: normalized };
}

export async function getClassSchedulesByLessonIds(
  db: D1Database,
  lessonIds: number[]
): Promise<Map<number, JpLessonClassSchedule[]>> {
  const map = new Map<number, JpLessonClassSchedule[]>();
  if (!lessonIds.length) return map;

  if (devStoreEnabled) {
    for (const lessonId of lessonIds) {
      map.set(lessonId, [...(devSchedules.get(lessonId) ?? [])]);
    }
    return map;
  }

  const placeholders = lessonIds.map((_, index) => `?${index + 1}`).join(", ");
  const result = await db
    .prepare(
      `SELECT id, lesson_id, class_at, duration_minutes, sort_order
       FROM jp_lesson_class_schedule
       WHERE lesson_id IN (${placeholders})
       ORDER BY sort_order ASC, class_at ASC, id ASC`
    )
    .bind(...lessonIds)
    .all<Record<string, unknown>>();

  for (const row of result.results || []) {
    const lessonId = Number(row.lesson_id);
    const list = map.get(lessonId) ?? [];
    list.push(mapRow(row));
    map.set(lessonId, list);
  }

  return map;
}

export type ReplaceLessonClassSchedulesResult =
  | { ok: true; schedules: JpLessonClassSchedule[] }
  | { ok: false; error: string };

export async function replaceLessonClassSchedules(
  db: D1Database,
  lessonId: number,
  schedules: JpLessonClassScheduleInput[]
): Promise<ReplaceLessonClassSchedulesResult> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const normalizedResult = normalizeClassScheduleInputs(schedules);
  if (!normalizedResult.ok) return normalizedResult;

  const normalized = normalizedResult.schedules;
  const ts = nowIso();

  if (devStoreEnabled) {
    const next = normalized.map((item, index) => ({
      id: devNextId++,
      class_at: item.class_at,
      duration_minutes: item.duration_minutes,
    }));
    devSchedules.set(lessonId, next);
    return { ok: true, schedules: next };
  }

  await db.prepare(`DELETE FROM jp_lesson_class_schedule WHERE lesson_id = ?1`).bind(lessonId).run();

  for (let index = 0; index < normalized.length; index += 1) {
    const item = normalized[index];
    await db
      .prepare(
        `INSERT INTO jp_lesson_class_schedule
         (lesson_id, class_at, duration_minutes, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .bind(lessonId, item.class_at, item.duration_minutes, index, ts)
      .run();
  }

  const map = await getClassSchedulesByLessonIds(db, [lessonId]);
  return { ok: true, schedules: map.get(lessonId) ?? [] };
}
