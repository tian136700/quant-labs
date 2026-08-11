import "server-only";

/**
 * CalDAV / ICS / Bark 日程导出：只拉「有课表且学习中/已完成」的轻量教案字段。
 * 禁止走 listJpLessons / listEnLessons（全量释义与例句大字段 → Worker 1102）。
 */

import { getClassSchedulesByLessonIds as getEnClassSchedulesByLessonIds } from "@/lib/en-lesson-class-schedule-db";
import {
  getLessonTeacherIdsByLessonIds as getEnLessonTeacherIdsByLessonIds,
  listEnLessonTeachers,
} from "@/lib/en-lesson-teacher-db";
import { getClassSchedulesByLessonIds as getJpClassSchedulesByLessonIds } from "@/lib/jp-lesson-class-schedule-db";
import {
  getLessonTeacherIdsByLessonIds as getJpLessonTeacherIdsByLessonIds,
  listJpLessonTeachers,
} from "@/lib/jp-lesson-teacher-db";
import { listJpLessonManualSchedules } from "@/lib/jp-lesson-manual-schedule-db";

/** 日历描述里学习内容预览上限（字符）；整课词表/例句不要进手机日历 */
export const SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS = 120;

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

export type ScheduleCalDavLoadBundle = {
  jpLessons: ScheduleCalDavLessonLite[];
  enLessons: ScheduleCalDavLessonLite[];
  manuals: Awaited<ReturnType<typeof listJpLessonManualSchedules>>;
  jpTeachers: Awaited<ReturnType<typeof listJpLessonTeachers>>;
  enTeachers: Awaited<ReturnType<typeof listEnLessonTeachers>>;
};

function truncateContentPreview(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  if (text.length <= SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS) return text;
  return `${text.slice(0, SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS)}…`;
}

function mapLiteRow(row: Record<string, unknown>): Omit<
  ScheduleCalDavLessonLite,
  "teacher_ids" | "class_schedules"
> {
  const nextClassAt =
    row.next_class_at != null && String(row.next_class_at).trim()
      ? String(row.next_class_at).trim()
      : null;
  const durationRaw =
    row.class_duration_minutes != null ? Number(row.class_duration_minutes) : null;
  return {
    id: Number(row.id),
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
    next_class_at: nextClassAt,
    class_duration_minutes:
      durationRaw != null && Number.isFinite(durationRaw) ? durationRaw : null,
  };
}

const JP_LITE_SELECT = `SELECT id, kind,
  SUBSTR(COALESCE(content, ''), 1, ${SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS}) AS content,
  title, teacher_other,
  next_class_at, class_duration_minutes, completed, learning
 FROM jp_lesson
 WHERE (completed = 1 OR learning = 1)
   AND (
     EXISTS (
       SELECT 1 FROM jp_lesson_class_schedule s WHERE s.lesson_id = jp_lesson.id
     )
     OR (next_class_at IS NOT NULL AND TRIM(next_class_at) != '')
   )`;

const EN_LITE_SELECT = `SELECT id, kind,
  SUBSTR(COALESCE(content, ''), 1, ${SCHEDULE_CALDAV_CONTENT_PREVIEW_CHARS}) AS content,
  title, teacher_other,
  next_class_at, class_duration_minutes, completed, learning
 FROM en_lesson
 WHERE (completed = 1 OR learning = 1)
   AND (
     EXISTS (
       SELECT 1 FROM en_lesson_class_schedule s WHERE s.lesson_id = en_lesson.id
     )
     OR (next_class_at IS NOT NULL AND TRIM(next_class_at) != '')
   )`;

async function attachSchedulesAndTeachers(
  db: D1Database,
  rows: Array<Omit<ScheduleCalDavLessonLite, "teacher_ids" | "class_schedules">>,
  subject: "jp" | "en"
): Promise<ScheduleCalDavLessonLite[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [scheduleMap, teacherMap] = await Promise.all([
    subject === "jp"
      ? getJpClassSchedulesByLessonIds(db, ids)
      : getEnClassSchedulesByLessonIds(db, ids),
    subject === "jp"
      ? getJpLessonTeacherIdsByLessonIds(db, ids)
      : getEnLessonTeacherIdsByLessonIds(db, ids),
  ]);

  return rows.map((lesson) => {
    const schedules = scheduleMap.get(lesson.id) ?? [];
    const legacySchedules =
      schedules.length > 0
        ? schedules
        : lesson.next_class_at
          ? [
              {
                id: 0,
                class_at: lesson.next_class_at,
                duration_minutes: lesson.class_duration_minutes,
              },
            ]
          : [];
    const first = legacySchedules[0];
    return {
      ...lesson,
      teacher_ids: teacherMap.get(lesson.id) ?? [],
      class_schedules: legacySchedules,
      next_class_at: first?.class_at ?? null,
      class_duration_minutes: first?.duration_minutes ?? null,
    };
  });
}

async function loadJpLessonsLite(
  db: D1Database
): Promise<ScheduleCalDavLessonLite[]> {
  const result = await db
    .prepare(JP_LITE_SELECT)
    .all<Record<string, unknown>>();
  const rows = (result.results || []).map(mapLiteRow);
  return attachSchedulesAndTeachers(db, rows, "jp");
}

async function loadEnLessonsLite(
  db: D1Database
): Promise<ScheduleCalDavLessonLite[]> {
  const result = await db
    .prepare(EN_LITE_SELECT)
    .all<Record<string, unknown>>();
  const rows = (result.results || []).map(mapLiteRow);
  return attachSchedulesAndTeachers(db, rows, "en");
}

/** 加载 CalDAV/ICS 所需最小数据集（并行；不含例句/释义大字段） */
export async function loadScheduleCalDavBundle(
  db: D1Database
): Promise<ScheduleCalDavLoadBundle> {
  const [jpLessons, enLessons, manuals, jpTeachers, enTeachers] =
    await Promise.all([
      loadJpLessonsLite(db),
      loadEnLessonsLite(db),
      listJpLessonManualSchedules(db),
      listJpLessonTeachers(db),
      listEnLessonTeachers(db),
    ]);
  return { jpLessons, enLessons, manuals, jpTeachers, enTeachers };
}
