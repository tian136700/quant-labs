import "server-only";

import {
  normalizeClassDurationMinutes,
  parseBeijingDateTime,
} from "@/lib/jp-lesson-shared";
import type {
  JpLessonManualSchedule,
  JpLessonManualScheduleDraft,
} from "@/lib/jp-lesson-manual-schedule";
import {
  normalizeManualScheduleLinkedLessons,
  parseManualScheduleLinkedLessonsJson,
  serializeManualScheduleLinkedLessons,
} from "@/lib/jp-lesson-manual-schedule-linked";

let devStoreEnabled = false;
const devSchedules: JpLessonManualSchedule[] = [];
let devNextId = 1;
let schemaReady = false;

export function enableJpLessonManualScheduleDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isSqliteDuplicateColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate column name/i.test(msg);
}

async function ensureManualScheduleSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_lesson_manual_schedule (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         class_at TEXT NOT NULL,
         duration_minutes INTEGER,
         title TEXT NOT NULL,
         teacher TEXT NOT NULL DEFAULT '',
         note TEXT NOT NULL DEFAULT '',
         linked_lessons TEXT NOT NULL DEFAULT '[]',
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    )
    .run();

  const info = await db
    .prepare(`PRAGMA table_info(jp_lesson_manual_schedule)`)
    .all<{ name: string }>();
  const cols = new Set(
    (info.results ?? [])
      .map((row) => (typeof row.name === "string" ? row.name : ""))
      .filter(Boolean)
  );

  if (!cols.has("linked_lessons")) {
    try {
      await db
        .prepare(
          `ALTER TABLE jp_lesson_manual_schedule ADD COLUMN linked_lessons TEXT NOT NULL DEFAULT '[]'`
        )
        .run();
      cols.add("linked_lessons");
    } catch (err) {
      if (!isSqliteDuplicateColumnError(err)) throw err;
      cols.add("linked_lessons");
    }
  }

  schemaReady = true;
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

function normalizeDraft(
  draft: JpLessonManualScheduleDraft
): JpLessonManualScheduleDraft | null {
  const title = draft.title.trim();
  const classAt = normalizeClassAt(draft.class_at);
  if (!title || !classAt || !parseBeijingDateTime(classAt)) return null;

  const durationMinutes = normalizeClassDurationMinutes(draft.duration_minutes);
  if (draft.duration_minutes != null && durationMinutes == null) {
    return null;
  }

  return {
    title,
    class_at: classAt,
    duration_minutes: durationMinutes,
    teacher: draft.teacher.trim(),
    note: draft.note.trim(),
    linked_lessons: normalizeManualScheduleLinkedLessons(draft.linked_lessons),
  };
}

function mapRow(row: Record<string, unknown>): JpLessonManualSchedule {
  return {
    id: Number(row.id),
    class_at: String(row.class_at).trim(),
    duration_minutes: normalizeClassDurationMinutes(
      row.duration_minutes != null ? Number(row.duration_minutes) : null
    ),
    title: String(row.title).trim(),
    teacher: String(row.teacher ?? "").trim(),
    note: String(row.note ?? "").trim(),
    linked_lessons: parseManualScheduleLinkedLessonsJson(
      row.linked_lessons != null ? String(row.linked_lessons) : "[]"
    ),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const SCHEDULE_SELECT = `SELECT id, class_at, duration_minutes, title, teacher, note, linked_lessons, created_at, updated_at FROM jp_lesson_manual_schedule`;

export async function listJpLessonManualSchedules(
  db: D1Database
): Promise<JpLessonManualSchedule[]> {
  if (devStoreEnabled) {
    return [...devSchedules].sort((a, b) => a.class_at.localeCompare(b.class_at));
  }

  await ensureManualScheduleSchema(db);

  const result = await db
    .prepare(`${SCHEDULE_SELECT} ORDER BY class_at ASC, id ASC`)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export type CreateJpLessonManualScheduleResult =
  | { ok: true; schedule: JpLessonManualSchedule }
  | { ok: false; error: string };

export async function createJpLessonManualSchedule(
  db: D1Database,
  draft: JpLessonManualScheduleDraft
): Promise<CreateJpLessonManualScheduleResult> {
  const normalized = normalizeDraft(draft);
  if (!normalized) return { ok: false, error: "draft_invalid" };

  const ts = nowIso();
  const linkedLessons = normalizeManualScheduleLinkedLessons(
    normalized.linked_lessons
  );

  if (devStoreEnabled) {
    const schedule: JpLessonManualSchedule = {
      id: devNextId++,
      ...normalized,
      linked_lessons: linkedLessons,
      created_at: ts,
      updated_at: ts,
    };
    devSchedules.push(schedule);
    devSchedules.sort((a, b) => a.class_at.localeCompare(b.class_at));
    return { ok: true, schedule };
  }

  await ensureManualScheduleSchema(db);

  const result = await db
    .prepare(
      `INSERT INTO jp_lesson_manual_schedule
       (class_at, duration_minutes, title, teacher, note, linked_lessons, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
    )
    .bind(
      normalized.class_at,
      normalized.duration_minutes,
      normalized.title,
      normalized.teacher,
      normalized.note,
      serializeManualScheduleLinkedLessons(linkedLessons),
      ts
    )
    .run();

  const id = Number(result.meta?.last_row_id);
  if (!id) return { ok: false, error: "insert_failed" };

  const row = await db
    .prepare(`${SCHEDULE_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "insert_failed" };
  return { ok: true, schedule: mapRow(row) };
}

export type UpdateJpLessonManualScheduleResult =
  | { ok: true; schedule: JpLessonManualSchedule }
  | { ok: false; error: string };

export async function updateJpLessonManualSchedule(
  db: D1Database,
  id: number,
  draft: JpLessonManualScheduleDraft
): Promise<UpdateJpLessonManualScheduleResult> {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "schedule_id_invalid" };
  }

  const normalized = normalizeDraft(draft);
  if (!normalized) return { ok: false, error: "draft_invalid" };

  const ts = nowIso();
  const linkedLessons = normalizeManualScheduleLinkedLessons(
    normalized.linked_lessons
  );

  if (devStoreEnabled) {
    const index = devSchedules.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, error: "not_found" };
    devSchedules[index] = {
      ...devSchedules[index],
      ...normalized,
      linked_lessons: linkedLessons,
      updated_at: ts,
    };
    return { ok: true, schedule: devSchedules[index] };
  }

  await ensureManualScheduleSchema(db);

  const result = await db
    .prepare(
      `UPDATE jp_lesson_manual_schedule
       SET class_at = ?1, duration_minutes = ?2, title = ?3, teacher = ?4, note = ?5,
           linked_lessons = ?6, updated_at = ?7
       WHERE id = ?8`
    )
    .bind(
      normalized.class_at,
      normalized.duration_minutes,
      normalized.title,
      normalized.teacher,
      normalized.note,
      serializeManualScheduleLinkedLessons(linkedLessons),
      ts,
      id
    )
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };

  const row = await db
    .prepare(`${SCHEDULE_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, schedule: mapRow(row) };
}

export type DeleteJpLessonManualScheduleResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteJpLessonManualSchedule(
  db: D1Database,
  id: number
): Promise<DeleteJpLessonManualScheduleResult> {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "schedule_id_invalid" };
  }

  if (devStoreEnabled) {
    const index = devSchedules.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, error: "not_found" };
    devSchedules.splice(index, 1);
    return { ok: true };
  }

  await ensureManualScheduleSchema(db);

  const result = await db
    .prepare("DELETE FROM jp_lesson_manual_schedule WHERE id = ?1")
    .bind(id)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };
  return { ok: true };
}
