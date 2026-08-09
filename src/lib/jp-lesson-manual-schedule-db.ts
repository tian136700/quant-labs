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
  type ManualScheduleLinkedLesson,
} from "@/lib/jp-lesson-manual-schedule-linked";

let devStoreEnabled = false;
const devSchedules: JpLessonManualSchedule[] = [];
let devNextId = 1;
const devRecurringRules: JpLessonManualScheduleRecurringRuleRow[] = [];
let devNextRecurringId = 1;
let schemaReady = false;

export type JpLessonManualScheduleRecurringRuleRow = {
  id: number;
  weekday: number;
  time_hm: string;
  duration_minutes: number | null;
  title: string;
  teacher: string;
  note: string;
  linked_lessons: ManualScheduleLinkedLesson[];
  active: number;
  created_at: string;
  updated_at: string;
};

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

export async function ensureJpLessonManualScheduleSchema(
  db: D1Database
): Promise<void> {
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
         recurring_id INTEGER,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_lesson_manual_schedule_recurring (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         weekday INTEGER NOT NULL,
         time_hm TEXT NOT NULL,
         duration_minutes INTEGER,
         title TEXT NOT NULL,
         teacher TEXT NOT NULL DEFAULT '',
         note TEXT NOT NULL DEFAULT '',
         linked_lessons TEXT NOT NULL DEFAULT '[]',
         active INTEGER NOT NULL DEFAULT 1,
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

  for (const col of ["linked_lessons", "recurring_id"] as const) {
    if (cols.has(col)) continue;
    try {
      if (col === "linked_lessons") {
        await db
          .prepare(
            `ALTER TABLE jp_lesson_manual_schedule ADD COLUMN linked_lessons TEXT NOT NULL DEFAULT '[]'`
          )
          .run();
      } else {
        await db
          .prepare(
            `ALTER TABLE jp_lesson_manual_schedule ADD COLUMN recurring_id INTEGER`
          )
          .run();
      }
      cols.add(col);
    } catch (err) {
      if (!isSqliteDuplicateColumnError(err)) throw err;
      cols.add(col);
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

export function normalizeJpLessonManualScheduleDraft(
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
    recurring: draft.recurring === true,
  };
}

function mapRow(row: Record<string, unknown>): JpLessonManualSchedule {
  const recurringRaw = row.recurring_id;
  const recurringId =
    recurringRaw == null || recurringRaw === ""
      ? null
      : Number(recurringRaw);
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
    recurring_id:
      recurringId != null && Number.isInteger(recurringId) && recurringId > 0
        ? recurringId
        : null,
    recurring: null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRecurringRow(
  row: Record<string, unknown>
): JpLessonManualScheduleRecurringRuleRow {
  return {
    id: Number(row.id),
    weekday: Number(row.weekday),
    time_hm: String(row.time_hm).trim(),
    duration_minutes: normalizeClassDurationMinutes(
      row.duration_minutes != null ? Number(row.duration_minutes) : null
    ),
    title: String(row.title).trim(),
    teacher: String(row.teacher ?? "").trim(),
    note: String(row.note ?? "").trim(),
    linked_lessons: parseManualScheduleLinkedLessonsJson(
      row.linked_lessons != null ? String(row.linked_lessons) : "[]"
    ),
    active: Number(row.active) === 0 ? 0 : 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const SCHEDULE_SELECT = `SELECT id, class_at, duration_minutes, title, teacher, note, linked_lessons, recurring_id, created_at, updated_at FROM jp_lesson_manual_schedule`;

const RECURRING_SELECT = `SELECT id, weekday, time_hm, duration_minutes, title, teacher, note, linked_lessons, active, created_at, updated_at FROM jp_lesson_manual_schedule_recurring`;

export async function listJpLessonManualSchedules(
  db: D1Database
): Promise<JpLessonManualSchedule[]> {
  if (devStoreEnabled) {
    return [...devSchedules].sort((a, b) => a.class_at.localeCompare(b.class_at));
  }

  await ensureJpLessonManualScheduleSchema(db);

  const result = await db
    .prepare(`${SCHEDULE_SELECT} ORDER BY class_at ASC, id ASC`)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export async function getJpLessonManualScheduleById(
  db: D1Database,
  id: number
): Promise<JpLessonManualSchedule | null> {
  if (!Number.isInteger(id) || id <= 0) return null;

  if (devStoreEnabled) {
    return devSchedules.find((s) => s.id === id) ?? null;
  }

  await ensureJpLessonManualScheduleSchema(db);
  const row = await db
    .prepare(`${SCHEDULE_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? mapRow(row) : null;
}

export type CreateJpLessonManualScheduleResult =
  | { ok: true; schedule: JpLessonManualSchedule }
  | { ok: false; error: string };

export async function createJpLessonManualSchedule(
  db: D1Database,
  draft: JpLessonManualScheduleDraft
): Promise<CreateJpLessonManualScheduleResult> {
  return insertJpLessonManualScheduleInstance(db, {
    ...draft,
    recurring_id: null,
  });
}

export async function insertJpLessonManualScheduleInstance(
  db: D1Database,
  draft: JpLessonManualScheduleDraft & { recurring_id?: number | null }
): Promise<CreateJpLessonManualScheduleResult> {
  const normalized = normalizeJpLessonManualScheduleDraft(draft);
  if (!normalized) return { ok: false, error: "draft_invalid" };

  const ts = nowIso();
  const linkedLessons = normalizeManualScheduleLinkedLessons(
    normalized.linked_lessons
  );
  const recurringId =
    draft.recurring_id != null &&
    Number.isInteger(draft.recurring_id) &&
    draft.recurring_id > 0
      ? draft.recurring_id
      : null;

  if (devStoreEnabled) {
    const schedule: JpLessonManualSchedule = {
      id: devNextId++,
      ...normalized,
      linked_lessons: linkedLessons,
      recurring_id: recurringId,
      recurring: null,
      created_at: ts,
      updated_at: ts,
    };
    devSchedules.push(schedule);
    devSchedules.sort((a, b) => a.class_at.localeCompare(b.class_at));
    return { ok: true, schedule };
  }

  await ensureJpLessonManualScheduleSchema(db);

  const result = await db
    .prepare(
      `INSERT INTO jp_lesson_manual_schedule
       (class_at, duration_minutes, title, teacher, note, linked_lessons, recurring_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`
    )
    .bind(
      normalized.class_at,
      normalized.duration_minutes,
      normalized.title,
      normalized.teacher,
      normalized.note,
      serializeManualScheduleLinkedLessons(linkedLessons),
      recurringId,
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

  const normalized = normalizeJpLessonManualScheduleDraft(draft);
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

  await ensureJpLessonManualScheduleSchema(db);

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

  await ensureJpLessonManualScheduleSchema(db);

  const result = await db
    .prepare("DELETE FROM jp_lesson_manual_schedule WHERE id = ?1")
    .bind(id)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };
  return { ok: true };
}

export async function listJpLessonManualScheduleRecurringRules(
  db: D1Database,
  opts?: { activeOnly?: boolean }
): Promise<JpLessonManualScheduleRecurringRuleRow[]> {
  if (devStoreEnabled) {
    const rows = [...devRecurringRules];
    return opts?.activeOnly ? rows.filter((r) => r.active === 1) : rows;
  }

  await ensureJpLessonManualScheduleSchema(db);
  const sql = opts?.activeOnly
    ? `${RECURRING_SELECT} WHERE active = 1 ORDER BY id ASC`
    : `${RECURRING_SELECT} ORDER BY id ASC`;
  const result = await db.prepare(sql).all<Record<string, unknown>>();
  return (result.results || []).map(mapRecurringRow);
}

export async function insertJpLessonManualScheduleRecurringRule(
  db: D1Database,
  input: {
    weekday: number;
    time_hm: string;
    duration_minutes: number | null;
    title: string;
    teacher: string;
    note: string;
    linked_lessons: ManualScheduleLinkedLesson[];
  }
): Promise<
  | { ok: true; rule: JpLessonManualScheduleRecurringRuleRow }
  | { ok: false; error: string }
> {
  const ts = nowIso();
  if (
    !Number.isInteger(input.weekday) ||
    input.weekday < 0 ||
    input.weekday > 6
  ) {
    return { ok: false, error: "weekday_invalid" };
  }

  if (devStoreEnabled) {
    const rule: JpLessonManualScheduleRecurringRuleRow = {
      id: devNextRecurringId++,
      weekday: input.weekday,
      time_hm: input.time_hm,
      duration_minutes: input.duration_minutes,
      title: input.title,
      teacher: input.teacher,
      note: input.note,
      linked_lessons: input.linked_lessons,
      active: 1,
      created_at: ts,
      updated_at: ts,
    };
    devRecurringRules.push(rule);
    return { ok: true, rule };
  }

  await ensureJpLessonManualScheduleSchema(db);
  const result = await db
    .prepare(
      `INSERT INTO jp_lesson_manual_schedule_recurring
       (weekday, time_hm, duration_minutes, title, teacher, note, linked_lessons, active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)`
    )
    .bind(
      input.weekday,
      input.time_hm,
      input.duration_minutes,
      input.title,
      input.teacher,
      input.note,
      serializeManualScheduleLinkedLessons(input.linked_lessons),
      ts
    )
    .run();

  const id = Number(result.meta?.last_row_id);
  if (!id) return { ok: false, error: "insert_failed" };
  const row = await db
    .prepare(`${RECURRING_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return { ok: false, error: "insert_failed" };
  return { ok: true, rule: mapRecurringRow(row) };
}

export async function updateJpLessonManualScheduleRecurringRule(
  db: D1Database,
  id: number,
  input: {
    weekday: number;
    time_hm: string;
    duration_minutes: number | null;
    title: string;
    teacher: string;
    note: string;
    linked_lessons: ManualScheduleLinkedLesson[];
    active: number;
  }
): Promise<
  | { ok: true; rule: JpLessonManualScheduleRecurringRuleRow }
  | { ok: false; error: string }
> {
  const ts = nowIso();
  if (devStoreEnabled) {
    const index = devRecurringRules.findIndex((r) => r.id === id);
    if (index < 0) return { ok: false, error: "not_found" };
    devRecurringRules[index] = {
      ...devRecurringRules[index],
      weekday: input.weekday,
      time_hm: input.time_hm,
      duration_minutes: input.duration_minutes,
      title: input.title,
      teacher: input.teacher,
      note: input.note,
      linked_lessons: input.linked_lessons,
      active: input.active === 0 ? 0 : 1,
      updated_at: ts,
    };
    return { ok: true, rule: devRecurringRules[index] };
  }

  await ensureJpLessonManualScheduleSchema(db);
  const result = await db
    .prepare(
      `UPDATE jp_lesson_manual_schedule_recurring
       SET weekday = ?1, time_hm = ?2, duration_minutes = ?3, title = ?4, teacher = ?5,
           note = ?6, linked_lessons = ?7, active = ?8, updated_at = ?9
       WHERE id = ?10`
    )
    .bind(
      input.weekday,
      input.time_hm,
      input.duration_minutes,
      input.title,
      input.teacher,
      input.note,
      serializeManualScheduleLinkedLessons(input.linked_lessons),
      input.active === 0 ? 0 : 1,
      ts,
      id
    )
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };
  const row = await db
    .prepare(`${RECURRING_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, rule: mapRecurringRow(row) };
}

export async function setJpLessonManualScheduleRecurringActive(
  db: D1Database,
  id: number,
  active: boolean
): Promise<void> {
  const ts = nowIso();
  if (devStoreEnabled) {
    const rule = devRecurringRules.find((r) => r.id === id);
    if (rule) {
      rule.active = active ? 1 : 0;
      rule.updated_at = ts;
    }
    return;
  }

  await ensureJpLessonManualScheduleSchema(db);
  await db
    .prepare(
      `UPDATE jp_lesson_manual_schedule_recurring SET active = ?1, updated_at = ?2 WHERE id = ?3`
    )
    .bind(active ? 1 : 0, ts, id)
    .run();
}

/** 删除 class_at >= fromClassAt 的系列实例；返回删除条数 */
export async function deleteJpLessonManualScheduleFutureByRecurringId(
  db: D1Database,
  recurringId: number,
  fromClassAt: string
): Promise<number> {
  if (devStoreEnabled) {
    const before = devSchedules.length;
    for (let i = devSchedules.length - 1; i >= 0; i--) {
      const s = devSchedules[i];
      if (s.recurring_id === recurringId && s.class_at >= fromClassAt) {
        devSchedules.splice(i, 1);
      }
    }
    return before - devSchedules.length;
  }

  await ensureJpLessonManualScheduleSchema(db);
  const result = await db
    .prepare(
      `DELETE FROM jp_lesson_manual_schedule
       WHERE recurring_id = ?1 AND class_at >= ?2`
    )
    .bind(recurringId, fromClassAt)
    .run();
  return Number(result.meta?.changes ?? 0);
}

export async function listJpLessonManualScheduleClassAtsByRecurringId(
  db: D1Database,
  recurringId: number
): Promise<string[]> {
  if (devStoreEnabled) {
    return devSchedules
      .filter((s) => s.recurring_id === recurringId)
      .map((s) => s.class_at);
  }

  await ensureJpLessonManualScheduleSchema(db);
  const result = await db
    .prepare(
      `SELECT class_at FROM jp_lesson_manual_schedule WHERE recurring_id = ?1`
    )
    .bind(recurringId)
    .all<{ class_at: string }>();
  return (result.results || []).map((r) => String(r.class_at));
}
