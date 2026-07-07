import "server-only";

import type { EnLessonTeacher } from "@/lib/types";
import {
  normalizeHourlyRate,
  normalizeTeacherLessonMinutes,
} from "@/lib/jp-lesson-teacher-rate";

let devStoreEnabled = false;
const devTeachers: EnLessonTeacher[] = [];
const devLessonTeacherLinks = new Map<number, number[]>();
let devNextId = 1;
let teacherSchemaEnsured = false;

export function enableEnLessonTeacherDevStore() {
  devStoreEnabled = true;
}

async function ensureTeacherSchema(db: D1Database): Promise<void> {
  if (teacherSchemaEnsured) return;
  const info = await db.prepare(`PRAGMA table_info(en_lesson_teacher)`).all<{
    name: string;
  }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  if (!cols.has("hourly_rate")) {
    await db.prepare(`ALTER TABLE en_lesson_teacher ADD COLUMN hourly_rate REAL`).run();
  }
  if (!cols.has("lesson_minutes")) {
    await db
      .prepare(`ALTER TABLE en_lesson_teacher ADD COLUMN lesson_minutes INTEGER`)
      .run();
  }
  teacherSchemaEnsured = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapRow(row: Record<string, unknown>): EnLessonTeacher {
  const hourlyRaw = row.hourly_rate;
  const hourly_rate =
    hourlyRaw == null || hourlyRaw === ""
      ? null
      : normalizeHourlyRate(Number(hourlyRaw));
  return {
    id: Number(row.id),
    name: String(row.name),
    hourly_rate,
    lesson_minutes: normalizeTeacherLessonMinutes(row.lesson_minutes),
    sort_order: Number(row.sort_order) || 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const TEACHER_SELECT = `SELECT id, name, hourly_rate, lesson_minutes, sort_order, created_at, updated_at FROM en_lesson_teacher`;

export async function listEnLessonTeachers(db: D1Database): Promise<EnLessonTeacher[]> {
  if (devStoreEnabled) {
    return [...devTeachers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }

  await ensureTeacherSchema(db);

  const result = await db
    .prepare(`${TEACHER_SELECT} ORDER BY sort_order ASC, id ASC`)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export async function getEnLessonTeacherById(
  db: D1Database,
  teacherId: number
): Promise<EnLessonTeacher | null> {
  if (!Number.isInteger(teacherId) || teacherId <= 0) return null;

  if (devStoreEnabled) {
    return devTeachers.find((t) => t.id === teacherId) ?? null;
  }

  await ensureTeacherSchema(db);

  const row = await db
    .prepare(`${TEACHER_SELECT} WHERE id = ?1`)
    .bind(teacherId)
    .first<Record<string, unknown>>();

  return row ? mapRow(row) : null;
}

export type MutateEnLessonTeacherResult =
  | { ok: true; teacher: EnLessonTeacher }
  | { ok: false; error: string };

export async function createEnLessonTeacher(
  db: D1Database,
  name: string,
  sortOrder = 0,
  hourlyRate: number | null = null,
  lessonMinutes: number | null = null
): Promise<MutateEnLessonTeacherResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "name_empty" };

  const hourly_rate = normalizeHourlyRate(hourlyRate);
  const lesson_minutes = normalizeTeacherLessonMinutes(lessonMinutes);
  const ts = nowIso();

  if (devStoreEnabled) {
    if (devTeachers.some((t) => t.name === trimmed)) {
      return { ok: false, error: "name_duplicate" };
    }
    const teacher: EnLessonTeacher = {
      id: devNextId++,
      name: trimmed,
      hourly_rate,
      lesson_minutes,
      sort_order: sortOrder,
      created_at: ts,
      updated_at: ts,
    };
    devTeachers.push(teacher);
    return { ok: true, teacher };
  }

  await ensureTeacherSchema(db);

  try {
    const result = await db
      .prepare(
        `INSERT INTO en_lesson_teacher (name, hourly_rate, lesson_minutes, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)`
      )
      .bind(trimmed, hourly_rate, lesson_minutes, sortOrder, ts)
      .run();

    const id = Number(result.meta?.last_row_id);
    if (!id) return { ok: false, error: "insert_failed" };

    const teacher = await getEnLessonTeacherById(db, id);
    if (!teacher) return { ok: false, error: "insert_failed" };
    return { ok: true, teacher };
  } catch {
    return { ok: false, error: "name_duplicate" };
  }
}

export async function updateEnLessonTeacher(
  db: D1Database,
  teacherId: number,
  input: {
    name?: string;
    sort_order?: number;
    hourly_rate?: number | null;
    lesson_minutes?: number | null;
  }
): Promise<MutateEnLessonTeacherResult> {
  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return { ok: false, error: "teacher_id_invalid" };
  }

  const existing = await getEnLessonTeacherById(db, teacherId);
  if (!existing) return { ok: false, error: "not_found" };

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) return { ok: false, error: "name_empty" };

  const sortOrder =
    input.sort_order !== undefined ? input.sort_order : existing.sort_order;
  const hourly_rate =
    input.hourly_rate !== undefined
      ? normalizeHourlyRate(input.hourly_rate)
      : existing.hourly_rate;
  const lesson_minutes =
    input.lesson_minutes !== undefined
      ? normalizeTeacherLessonMinutes(input.lesson_minutes)
      : existing.lesson_minutes;
  const ts = nowIso();

  if (devStoreEnabled) {
    if (devTeachers.some((t) => t.id !== teacherId && t.name === name)) {
      return { ok: false, error: "name_duplicate" };
    }
    const idx = devTeachers.findIndex((t) => t.id === teacherId);
    devTeachers[idx] = {
      ...devTeachers[idx],
      name,
      hourly_rate,
      lesson_minutes,
      sort_order: sortOrder,
      updated_at: ts,
    };
    return { ok: true, teacher: devTeachers[idx] };
  }

  await ensureTeacherSchema(db);

  try {
    const result = await db
      .prepare(
        `UPDATE en_lesson_teacher SET name = ?1, hourly_rate = ?2, lesson_minutes = ?3, sort_order = ?4, updated_at = ?5 WHERE id = ?6`
      )
      .bind(name, hourly_rate, lesson_minutes, sortOrder, ts, teacherId)
      .run();

    if (!result.meta?.changes) return { ok: false, error: "not_found" };

    const teacher = await getEnLessonTeacherById(db, teacherId);
    if (!teacher) return { ok: false, error: "not_found" };
    return { ok: true, teacher };
  } catch {
    return { ok: false, error: "name_duplicate" };
  }
}

export type DeleteEnLessonTeacherResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteEnLessonTeacher(
  db: D1Database,
  teacherId: number
): Promise<DeleteEnLessonTeacherResult> {
  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return { ok: false, error: "teacher_id_invalid" };
  }

  if (devStoreEnabled) {
    const idx = devTeachers.findIndex((t) => t.id === teacherId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devTeachers.splice(idx, 1);
    for (const [lessonId, ids] of devLessonTeacherLinks.entries()) {
      devLessonTeacherLinks.set(
        lessonId,
        ids.filter((id) => id !== teacherId)
      );
    }
    return { ok: true };
  }

  const result = await db
    .prepare(`DELETE FROM en_lesson_teacher WHERE id = ?1`)
    .bind(teacherId)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };
  return { ok: true };
}

function normalizeTeacherIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function getLessonTeacherIdsByLessonIds(
  db: D1Database,
  lessonIds: number[]
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  for (const lessonId of lessonIds) {
    if (Number.isInteger(lessonId) && lessonId > 0) {
      map.set(lessonId, []);
    }
  }
  if (!map.size) return map;

  if (devStoreEnabled) {
    for (const lessonId of map.keys()) {
      map.set(lessonId, [...(devLessonTeacherLinks.get(lessonId) ?? [])]);
    }
    return map;
  }

  const placeholders = [...map.keys()].map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(
      `SELECT lesson_id, teacher_id
       FROM en_lesson_teacher_link
       WHERE lesson_id IN (${placeholders})
       ORDER BY lesson_id ASC, teacher_id ASC`
    )
    .bind(...map.keys())
    .all<{ lesson_id: number; teacher_id: number }>();

  for (const row of result.results || []) {
    const lessonId = Number(row.lesson_id);
    const teacherId = Number(row.teacher_id);
    const current = map.get(lessonId);
    if (current) current.push(teacherId);
  }

  return map;
}

export type ReplaceLessonTeachersResult =
  | { ok: true; teacher_ids: number[] }
  | { ok: false; error: string };

export async function replaceLessonTeachers(
  db: D1Database,
  lessonId: number,
  teacherIds: unknown
): Promise<ReplaceLessonTeachersResult> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const normalized = normalizeTeacherIds(teacherIds);
  if (normalized == null) {
    return { ok: false, error: "teacher_ids_invalid" };
  }

  if (normalized.length > 0) {
    const teachers = await listEnLessonTeachers(db);
    const validIds = new Set(teachers.map((t) => t.id));
    if (!normalized.every((id) => validIds.has(id))) {
      return { ok: false, error: "teacher_not_found" };
    }
  }

  const ts = nowIso();

  if (devStoreEnabled) {
    devLessonTeacherLinks.set(lessonId, normalized);
    return { ok: true, teacher_ids: normalized };
  }

  await db
    .prepare(`DELETE FROM en_lesson_teacher_link WHERE lesson_id = ?1`)
    .bind(lessonId)
    .run();

  for (const teacherId of normalized) {
    await db
      .prepare(
        `INSERT INTO en_lesson_teacher_link (lesson_id, teacher_id, created_at)
         VALUES (?1, ?2, ?3)`
      )
      .bind(lessonId, teacherId, ts)
      .run();
  }

  await db
    .prepare(`UPDATE en_lesson SET updated_at = ?1 WHERE id = ?2`)
    .bind(ts, lessonId)
    .run();

  return { ok: true, teacher_ids: normalized };
}
