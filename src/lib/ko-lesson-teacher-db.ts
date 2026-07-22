import "server-only";

import type { KoLessonTeacher } from "@/lib/types";
import {
  normalizeHourlyRate,
  normalizeTeacherLessonMinutes,
  resolveLessonTeacherRateFields,
} from "@/lib/jp-lesson-teacher-rate";
import {
  planLessonTeacherNameForCreate,
  planLessonTeacherNameForUpdate,
} from "@/lib/lesson-teacher-name";

let devStoreEnabled = false;
const devTeachers: KoLessonTeacher[] = [];
const devLessonTeacherLinks = new Map<number, number[]>();
let devNextId = 1;
let teacherSchemaEnsured = false;

export function enableKoLessonTeacherDevStore() {
  devStoreEnabled = true;
}

async function ensureTeacherSchema(db: D1Database): Promise<void> {
  if (teacherSchemaEnsured) return;
  const info = await db.prepare(`PRAGMA table_info(ko_lesson_teacher)`).all<{
    name: string;
  }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  if (!cols.has("hourly_rate")) {
    await db.prepare(`ALTER TABLE ko_lesson_teacher ADD COLUMN hourly_rate REAL`).run();
  }
  if (!cols.has("lesson_minutes")) {
    await db
      .prepare(`ALTER TABLE ko_lesson_teacher ADD COLUMN lesson_minutes INTEGER`)
      .run();
  }
  teacherSchemaEnsured = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function readTeacherRowFields(row: Record<string, unknown>): {
  id: number;
  name: string;
  hourly_rate: number | null;
  lesson_minutes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
} {
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

function mapRow(row: Record<string, unknown>): KoLessonTeacher {
  const base = readTeacherRowFields(row);
  const resolved = resolveLessonTeacherRateFields(base);
  return { ...base, ...resolved };
}

const TEACHER_SELECT = `SELECT id, name, hourly_rate, lesson_minutes, sort_order, created_at, updated_at FROM ko_lesson_teacher`;

function countDevKoLessonTeacherAssignments(): Map<number, number> {
  const counts = new Map<number, number>();
  for (const teacherIds of devLessonTeacherLinks.values()) {
    for (const teacherId of teacherIds) {
      counts.set(teacherId, (counts.get(teacherId) ?? 0) + 1);
    }
  }
  return counts;
}

export async function getKoLessonTeacherLessonCounts(
  db: D1Database
): Promise<Map<number, number>> {
  if (devStoreEnabled) {
    return countDevKoLessonTeacherAssignments();
  }

  const result = await db
    .prepare(
      `SELECT teacher_id, COUNT(DISTINCT lesson_id) AS lesson_count
       FROM ko_lesson_teacher_link
       GROUP BY teacher_id`
    )
    .all<{ teacher_id: number; lesson_count: number }>();

  const counts = new Map<number, number>();
  for (const row of result.results ?? []) {
    counts.set(Number(row.teacher_id), Number(row.lesson_count) || 0);
  }
  return counts;
}

export function attachKoLessonTeacherLessonCounts(
  teachers: KoLessonTeacher[],
  counts: Map<number, number>
): KoLessonTeacher[] {
  return teachers.map((teacher) => ({
    ...teacher,
    lesson_count: counts.get(teacher.id) ?? 0,
  }));
}

export async function listKoLessonTeachersWithLessonCounts(
  db: D1Database
): Promise<KoLessonTeacher[]> {
  const [teachers, counts] = await Promise.all([
    listKoLessonTeachers(db),
    getKoLessonTeacherLessonCounts(db),
  ]);
  return attachKoLessonTeacherLessonCounts(teachers, counts);
}

export async function listKoLessonTeachers(db: D1Database): Promise<KoLessonTeacher[]> {
  if (devStoreEnabled) {
    return [...devTeachers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }

  await ensureTeacherSchema(db);

  const result = await db
    .prepare(`${TEACHER_SELECT} ORDER BY sort_order ASC, id ASC`)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export async function getKoLessonTeacherById(
  db: D1Database,
  teacherId: number
): Promise<KoLessonTeacher | null> {
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

export type MutateKoLessonTeacherResult =
  | { ok: true; teacher: KoLessonTeacher; renamed_teachers?: KoLessonTeacher[] }
  | { ok: false; error: string };

async function applyKoLessonTeacherRenames(
  db: D1Database,
  renames: Array<{ id: number; name: string }>,
  ts: string
): Promise<KoLessonTeacher[]> {
  const renamed: KoLessonTeacher[] = [];
  for (const item of renames) {
    await db
      .prepare(`UPDATE ko_lesson_teacher SET name = ?1, updated_at = ?2 WHERE id = ?3`)
      .bind(item.name, ts, item.id)
      .run();
    const teacher = await getKoLessonTeacherById(db, item.id);
    if (teacher) renamed.push(teacher);
  }
  return renamed;
}

function applyKoLessonTeacherRenamesDev(
  renames: Array<{ id: number; name: string }>,
  ts: string
): KoLessonTeacher[] {
  const renamed: KoLessonTeacher[] = [];
  for (const item of renames) {
    const idx = devTeachers.findIndex((teacher) => teacher.id === item.id);
    if (idx < 0) continue;
    devTeachers[idx] = { ...devTeachers[idx], name: item.name, updated_at: ts };
    renamed.push(devTeachers[idx]);
  }
  return renamed;
}

export async function createKoLessonTeacher(
  db: D1Database,
  name: string,
  sortOrder = 0,
  hourlyRate: number | null = null,
  lessonMinutes: number | null = null
): Promise<MutateKoLessonTeacherResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "name_empty" };

  const hourly_rate = normalizeHourlyRate(hourlyRate);
  const lesson_minutes = normalizeTeacherLessonMinutes(lessonMinutes);
  const ts = nowIso();

  if (devStoreEnabled) {
    const plan = planLessonTeacherNameForCreate(trimmed, devTeachers);
    const renamed_teachers = applyKoLessonTeacherRenamesDev(plan.renames, ts);
    const teacher: KoLessonTeacher = {
      id: devNextId++,
      name: plan.name,
      hourly_rate,
      lesson_minutes,
      sort_order: sortOrder,
      created_at: ts,
      updated_at: ts,
    };
    devTeachers.push(teacher);
    return renamed_teachers.length
      ? { ok: true, teacher, renamed_teachers }
      : { ok: true, teacher };
  }

  await ensureTeacherSchema(db);

  const existing = await listKoLessonTeachers(db);
  const plan = planLessonTeacherNameForCreate(trimmed, existing);
  const renamed_teachers = await applyKoLessonTeacherRenames(db, plan.renames, ts);

  const result = await db
    .prepare(
      `INSERT INTO ko_lesson_teacher (name, hourly_rate, lesson_minutes, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)`
    )
    .bind(plan.name, hourly_rate, lesson_minutes, sortOrder, ts)
    .run();

  const id = Number(result.meta?.last_row_id);
  if (!id) return { ok: false, error: "insert_failed" };

  const teacher = await getKoLessonTeacherById(db, id);
  if (!teacher) return { ok: false, error: "insert_failed" };
  return renamed_teachers.length
    ? { ok: true, teacher, renamed_teachers }
    : { ok: true, teacher };
}

export async function updateKoLessonTeacher(
  db: D1Database,
  teacherId: number,
  input: {
    name?: string;
    sort_order?: number;
    hourly_rate?: number | null;
    lesson_minutes?: number | null;
  }
): Promise<MutateKoLessonTeacherResult> {
  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return { ok: false, error: "teacher_id_invalid" };
  }

  const existing = await getKoLessonTeacherById(db, teacherId);
  if (!existing) return { ok: false, error: "not_found" };

  const requestedName = input.name !== undefined ? input.name.trim() : existing.name;
  if (!requestedName) return { ok: false, error: "name_empty" };

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
    const plan = planLessonTeacherNameForUpdate(teacherId, requestedName, devTeachers);
    const idx = devTeachers.findIndex((t) => t.id === teacherId);
    devTeachers[idx] = {
      ...devTeachers[idx],
      name: plan.name,
      hourly_rate,
      lesson_minutes,
      sort_order: sortOrder,
      updated_at: ts,
    };
    return { ok: true, teacher: devTeachers[idx] };
  }

  await ensureTeacherSchema(db);

  const allTeachers = await listKoLessonTeachers(db);
  const plan = planLessonTeacherNameForUpdate(teacherId, requestedName, allTeachers);

  const result = await db
    .prepare(
      `UPDATE ko_lesson_teacher SET name = ?1, hourly_rate = ?2, lesson_minutes = ?3, sort_order = ?4, updated_at = ?5 WHERE id = ?6`
    )
    .bind(plan.name, hourly_rate, lesson_minutes, sortOrder, ts, teacherId)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };

  const teacher = await getKoLessonTeacherById(db, teacherId);
  if (!teacher) return { ok: false, error: "not_found" };
  return { ok: true, teacher };
}

export type DeleteKoLessonTeacherResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteKoLessonTeacher(
  db: D1Database,
  teacherId: number
): Promise<DeleteKoLessonTeacherResult> {
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
    .prepare(`DELETE FROM ko_lesson_teacher WHERE id = ?1`)
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
       FROM ko_lesson_teacher_link
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
    const teachers = await listKoLessonTeachers(db);
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
    .prepare(`DELETE FROM ko_lesson_teacher_link WHERE lesson_id = ?1`)
    .bind(lessonId)
    .run();

  for (const teacherId of normalized) {
    await db
      .prepare(
        `INSERT INTO ko_lesson_teacher_link (lesson_id, teacher_id, created_at)
         VALUES (?1, ?2, ?3)`
      )
      .bind(lessonId, teacherId, ts)
      .run();
  }

  await db
    .prepare(`UPDATE ko_lesson SET updated_at = ?1 WHERE id = ?2`)
    .bind(ts, lessonId)
    .run();

  return { ok: true, teacher_ids: normalized };
}
