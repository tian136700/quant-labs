import "server-only";

/**
 * CalDAV / ICS / Bark / Telegram 日程导出：按日期窗轻量拉课表。
 * 禁止走 listJpLessons / listEnLessons（全量释义与例句大字段 → Worker 1102）。
 * 默认只取「今天前 14 天～后 180 天」有课次的行，避免把历史全表打进 Worker。
 */

import { chunkIdsForD1In } from "@/lib/d1-in-chunks";
import { listEnLessonTeachers } from "@/lib/en-lesson-teacher-db";
import { listJpLessonTeachers } from "@/lib/jp-lesson-teacher-db";
import {
  ensureJpLessonManualScheduleSchema,
  listJpLessonManualSchedules,
  type JpLessonManualSchedule,
} from "@/lib/jp-lesson-manual-schedule-db";
import { parseManualScheduleLinkedLessonsJson } from "@/lib/jp-lesson-manual-schedule-linked";

/** 日历描述里学习内容预览上限（字符）；整课词表/例句不要进手机日历 */
export const SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS = 80;

/** 未指定 from/to 时：北京日起往前保留的天数（含当天） */
export const SCHEDULE_CALDAV_DEFAULT_PAST_DAYS = 14;
/** 未指定 from/to 时：北京日起往后覆盖的天数（含当天） */
export const SCHEDULE_CALDAV_DEFAULT_FUTURE_DAYS = 180;

export type ScheduleCalDavLessonLite = {
  id: number;
  kind: string;
  content: string;
  title: string | null;
  teacher_other: string | null;
  completed: boolean;
  learning: boolean;
  teacher_ids: number[];
  class_schedules: Array<{
    id: number;
    class_at: string;
    duration_minutes: number | null;
  }>;
  next_class_at: string | null;
  class_duration_minutes: number | null;
};

export type ScheduleCalDavDateWindow = {
  /** Inclusive YYYY-MM-DD (Beijing wall) */
  fromDate: string;
  /** Inclusive YYYY-MM-DD (Beijing wall) */
  toDate: string;
  /** class_at lower bound: `${fromDate} 00:00:00` */
  fromClassAt: string;
  /** class_at exclusive upper: day after toDate */
  toClassAtExclusive: string;
};

export type ScheduleCalDavLoadOptions = {
  /** Inclusive YYYY-MM-DD；缺省用默认窗 */
  fromDate?: string;
  /** Inclusive YYYY-MM-DD；缺省用默认窗 */
  toDate?: string;
};

export type ScheduleCalDavLoadBundle = {
  jpLessons: ScheduleCalDavLessonLite[];
  enLessons: ScheduleCalDavLessonLite[];
  manuals: JpLessonManualSchedule[];
  jpTeachers: Awaited<ReturnType<typeof listJpLessonTeachers>>;
  enTeachers: Awaited<ReturnType<typeof listEnLessonTeachers>>;
  window: ScheduleCalDavDateWindow;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 当前北京墙钟日期 YYYY-MM-DD */
export function beijingTodayYmd(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [ys, ms, ds] = ymd.split("-").map((x) => Number(x));
  // 用 UTC 日历日加减，避免本地时区把墙钟日期弄偏
  const utc = Date.UTC(ys, ms - 1, ds + days);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function normalizeScheduleCalDavYmd(
  raw: string | null | undefined
): string | null {
  const s = (raw ?? "").trim();
  if (!DATE_RE.test(s)) return null;
  return s;
}

export function resolveScheduleCalDavDateWindow(
  opts?: ScheduleCalDavLoadOptions,
  now = new Date()
): ScheduleCalDavDateWindow {
  const today = beijingTodayYmd(now);
  const fromDate =
    normalizeScheduleCalDavYmd(opts?.fromDate) ??
    addDaysYmd(today, -SCHEDULE_CALDAV_DEFAULT_PAST_DAYS);
  const toDate =
    normalizeScheduleCalDavYmd(opts?.toDate) ??
    addDaysYmd(today, SCHEDULE_CALDAV_DEFAULT_FUTURE_DAYS);
  const [from, to] = fromDate <= toDate ? [fromDate, toDate] : [toDate, fromDate];
  return {
    fromDate: from,
    toDate: to,
    fromClassAt: `${from} 00:00:00`,
    toClassAtExclusive: `${addDaysYmd(to, 1)} 00:00:00`,
  };
}

function truncateContentPreview(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  if (text.length <= SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS) return text;
  return `${text.slice(0, SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS)}…`;
}

type JoinedScheduleRow = {
  lesson_id: number;
  schedule_id: number;
  class_at: string;
  duration_minutes: number | null;
  kind: string;
  content: string;
  title: string | null;
  teacher_other: string | null;
  completed: boolean;
  learning: boolean;
};

function mapJoinedRow(row: Record<string, unknown>): JoinedScheduleRow {
  const durationRaw =
    row.duration_minutes != null ? Number(row.duration_minutes) : null;
  return {
    lesson_id: Number(row.lesson_id),
    schedule_id: Number(row.schedule_id),
    class_at: String(row.class_at ?? "").trim(),
    duration_minutes:
      durationRaw != null && Number.isFinite(durationRaw) ? durationRaw : null,
    kind: String(row.kind ?? "word"),
    content: truncateContentPreview(
      row.content != null ? String(row.content) : ""
    ),
    title:
      row.title != null && String(row.title).trim()
        ? String(row.title).trim()
        : null,
    teacher_other:
      row.teacher_other != null && String(row.teacher_other).trim()
        ? String(row.teacher_other).trim()
        : null,
    completed: Number(row.completed) === 1,
    learning: Number(row.learning) === 1,
  };
}

const JP_JOINED_SELECT = `SELECT
  l.id AS lesson_id,
  s.id AS schedule_id,
  s.class_at AS class_at,
  s.duration_minutes AS duration_minutes,
  l.kind AS kind,
  SUBSTR(COALESCE(l.content, ''), 1, ${SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS}) AS content,
  l.title AS title,
  l.teacher_other AS teacher_other,
  l.completed AS completed,
  l.learning AS learning
 FROM jp_lesson_class_schedule s
 INNER JOIN jp_lesson l ON l.id = s.lesson_id
 WHERE (l.completed = 1 OR l.learning = 1)
   AND s.class_at >= ?1 AND s.class_at < ?2
 ORDER BY s.class_at ASC, s.id ASC`;

const EN_JOINED_SELECT = `SELECT
  l.id AS lesson_id,
  s.id AS schedule_id,
  s.class_at AS class_at,
  s.duration_minutes AS duration_minutes,
  l.kind AS kind,
  SUBSTR(COALESCE(l.content, ''), 1, ${SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS}) AS content,
  l.title AS title,
  l.teacher_other AS teacher_other,
  l.completed AS completed,
  l.learning AS learning
 FROM en_lesson_class_schedule s
 INNER JOIN en_lesson l ON l.id = s.lesson_id
 WHERE (l.completed = 1 OR l.learning = 1)
   AND s.class_at >= ?1 AND s.class_at < ?2
 ORDER BY s.class_at ASC, s.id ASC`;

/** 旧 next_class_at 且无 class_schedule 行、但仍落在窗内 */
const JP_LEGACY_SELECT = `SELECT
  id AS lesson_id,
  0 AS schedule_id,
  next_class_at AS class_at,
  class_duration_minutes AS duration_minutes,
  kind,
  SUBSTR(COALESCE(content, ''), 1, ${SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS}) AS content,
  title,
  teacher_other,
  completed,
  learning
 FROM jp_lesson
 WHERE (completed = 1 OR learning = 1)
   AND next_class_at IS NOT NULL AND TRIM(next_class_at) != ''
   AND next_class_at >= ?1 AND next_class_at < ?2
   AND NOT EXISTS (
     SELECT 1 FROM jp_lesson_class_schedule s WHERE s.lesson_id = jp_lesson.id
   )`;

const EN_LEGACY_SELECT = `SELECT
  id AS lesson_id,
  0 AS schedule_id,
  next_class_at AS class_at,
  class_duration_minutes AS duration_minutes,
  kind,
  SUBSTR(COALESCE(content, ''), 1, ${SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS}) AS content,
  title,
  teacher_other,
  completed,
  learning
 FROM en_lesson
 WHERE (completed = 1 OR learning = 1)
   AND next_class_at IS NOT NULL AND TRIM(next_class_at) != ''
   AND next_class_at >= ?1 AND next_class_at < ?2
   AND NOT EXISTS (
     SELECT 1 FROM en_lesson_class_schedule s WHERE s.lesson_id = en_lesson.id
   )`;

async function loadTeacherIdsByLessonIds(
  db: D1Database,
  lessonIds: number[],
  subject: "jp" | "en"
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (!lessonIds.length) return map;
  const table =
    subject === "jp" ? "jp_lesson_teacher_link" : "en_lesson_teacher_link";
  for (const chunk of chunkIdsForD1In(lessonIds)) {
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(", ");
    const result = await db
      .prepare(
        `SELECT lesson_id, teacher_id
         FROM ${table}
         WHERE lesson_id IN (${placeholders})
         ORDER BY lesson_id ASC, teacher_id ASC`
      )
      .bind(...chunk)
      .all<{ lesson_id: number; teacher_id: number }>();
    for (const row of result.results || []) {
      const lessonId = Number(row.lesson_id);
      const list = map.get(lessonId) ?? [];
      list.push(Number(row.teacher_id));
      map.set(lessonId, list);
    }
  }
  return map;
}

function groupJoinedToLessons(
  rows: JoinedScheduleRow[],
  teacherMap: Map<number, number[]>
): ScheduleCalDavLessonLite[] {
  const byId = new Map<number, ScheduleCalDavLessonLite>();
  for (const row of rows) {
    if (!row.class_at) continue;
    let lesson = byId.get(row.lesson_id);
    if (!lesson) {
      lesson = {
        id: row.lesson_id,
        kind: row.kind,
        content: row.content,
        title: row.title,
        teacher_other: row.teacher_other,
        completed: row.completed,
        learning: row.learning,
        teacher_ids: teacherMap.get(row.lesson_id) ?? [],
        class_schedules: [],
        next_class_at: null,
        class_duration_minutes: null,
      };
      byId.set(row.lesson_id, lesson);
    }
    lesson.class_schedules.push({
      id: row.schedule_id,
      class_at: row.class_at,
      duration_minutes: row.duration_minutes,
    });
  }
  for (const lesson of byId.values()) {
    const first = lesson.class_schedules[0];
    lesson.next_class_at = first?.class_at ?? null;
    lesson.class_duration_minutes = first?.duration_minutes ?? null;
  }
  return [...byId.values()];
}

async function loadSubjectLessonsInWindow(
  db: D1Database,
  subject: "jp" | "en",
  window: ScheduleCalDavDateWindow
): Promise<ScheduleCalDavLessonLite[]> {
  const joinedSql = subject === "jp" ? JP_JOINED_SELECT : EN_JOINED_SELECT;
  const legacySql = subject === "jp" ? JP_LEGACY_SELECT : EN_LEGACY_SELECT;
  const [joinedResult, legacyResult] = await Promise.all([
    db
      .prepare(joinedSql)
      .bind(window.fromClassAt, window.toClassAtExclusive)
      .all<Record<string, unknown>>(),
    db
      .prepare(legacySql)
      .bind(window.fromClassAt, window.toClassAtExclusive)
      .all<Record<string, unknown>>(),
  ]);
  const rows = [
    ...(joinedResult.results || []).map(mapJoinedRow),
    ...(legacyResult.results || []).map(mapJoinedRow),
  ];
  const lessonIds = [...new Set(rows.map((r) => r.lesson_id))];
  const teacherMap = await loadTeacherIdsByLessonIds(db, lessonIds, subject);
  return groupJoinedToLessons(rows, teacherMap);
}

async function listManualsInWindow(
  db: D1Database,
  window: ScheduleCalDavDateWindow
): Promise<JpLessonManualSchedule[]> {
  await ensureJpLessonManualScheduleSchema(db);
  const result = await db
    .prepare(
      `SELECT id, class_at, duration_minutes, title, teacher, note, linked_lessons,
              recurring_id, created_at, updated_at
       FROM jp_lesson_manual_schedule
       WHERE class_at >= ?1 AND class_at < ?2
       ORDER BY class_at ASC, id ASC`
    )
    .bind(window.fromClassAt, window.toClassAtExclusive)
    .all<Record<string, unknown>>();

  return (result.results || []).map((row) => {
    const durationRaw =
      row.duration_minutes != null ? Number(row.duration_minutes) : null;
    const recurringRaw =
      row.recurring_id != null ? Number(row.recurring_id) : null;
    return {
      id: Number(row.id),
      class_at: String(row.class_at).trim(),
      duration_minutes:
        durationRaw != null && Number.isFinite(durationRaw) ? durationRaw : null,
      title: String(row.title ?? ""),
      teacher: String(row.teacher ?? ""),
      note: String(row.note ?? ""),
      linked_lessons: parseManualScheduleLinkedLessonsJson(
        row.linked_lessons != null ? String(row.linked_lessons) : "[]"
      ),
      recurring_id:
        recurringRaw != null &&
        Number.isInteger(recurringRaw) &&
        recurringRaw > 0
          ? recurringRaw
          : null,
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    } satisfies JpLessonManualSchedule;
  });
}

/** 加载 CalDAV/ICS/Telegram 所需最小数据集（并行；按日期窗；不含例句/释义大字段） */
export async function loadScheduleCalDavBundle(
  db: D1Database,
  opts?: ScheduleCalDavLoadOptions
): Promise<ScheduleCalDavLoadBundle> {
  const window = resolveScheduleCalDavDateWindow(opts);
  const [jpLessons, enLessons, manuals, jpTeachers, enTeachers] =
    await Promise.all([
      loadSubjectLessonsInWindow(db, "jp", window),
      loadSubjectLessonsInWindow(db, "en", window),
      listManualsInWindow(db, window),
      listJpLessonTeachers(db),
      listEnLessonTeachers(db),
    ]);
  return { jpLessons, enLessons, manuals, jpTeachers, enTeachers, window };
}

/** 测试 / 兼容：仍可拉全量手动表（勿用于热路径导出） */
export async function loadAllManualSchedulesForTests(
  db: D1Database
): Promise<JpLessonManualSchedule[]> {
  return listJpLessonManualSchedules(db);
}
