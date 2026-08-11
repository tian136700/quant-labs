import "server-only";

import {
  getClassSchedulesByLessonIds,
} from "@/lib/jp-lesson-class-schedule-db";
import {
  compareJpLessonsByProgress,
  normalizeClassDurationMinutes,
  normalizeJpLessonKind,
} from "@/lib/jp-lesson-shared";
import {
  ensureJpLessonSchemaColumns,
  isJpLessonDevStoreEnabled,
  listJpLessons,
} from "@/lib/jp-lesson-db";
import { getLessonTeacherIdsByLessonIds } from "@/lib/jp-lesson-teacher-db";
import { truncateLessonContentForSchedule } from "@/lib/lesson-schedule-list-shared";
import type { JpLessonRecord } from "@/lib/types";

/** 日程页：不 SELECT meanings / annotations / example_sentences */
const SCHEDULE_LESSON_SELECT = `SELECT id, kind, content, grammar_item_count, course_label, course_group_id, title, ref_key, completed, learning,
  status_updated_at, status_updated_by, teacher_other, next_class_at, class_duration_minutes, link_copy_count, uploaded_at, created_at, updated_at FROM jp_lesson`;

function mapScheduleRow(row: Record<string, unknown>): JpLessonRecord {
  const nextClassAt =
    row.next_class_at != null && String(row.next_class_at).trim()
      ? String(row.next_class_at).trim()
      : null;
  const classDurationMinutes = normalizeClassDurationMinutes(
    row.class_duration_minutes != null ? Number(row.class_duration_minutes) : null
  );
  const kind = normalizeJpLessonKind(row.kind != null ? String(row.kind) : "word");
  const grammarItemCountRaw = Number(row.grammar_item_count);
  const grammarItemCount =
    kind === "word_grammar" && Number.isFinite(grammarItemCountRaw)
      ? Math.max(0, Math.floor(grammarItemCountRaw))
      : 0;

  return {
    id: Number(row.id),
    kind,
    content: truncateLessonContentForSchedule(String(row.content ?? "")),
    meanings: null,
    annotations: null,
    example_sentences: null,
    grammar_item_count: grammarItemCount,
    course_label:
      row.course_label != null && String(row.course_label).trim()
        ? String(row.course_label).trim()
        : null,
    course_group_id:
      row.course_group_id != null && String(row.course_group_id).trim()
        ? String(row.course_group_id).trim()
        : null,
    title: row.title != null ? String(row.title) : null,
    ref_key: row.ref_key != null ? String(row.ref_key) : null,
    completed: Number(row.completed) === 1,
    learning: Number(row.learning) === 1,
    status_updated_at:
      row.status_updated_at != null ? String(row.status_updated_at) : null,
    status_updated_by:
      row.status_updated_by != null ? String(row.status_updated_by) : null,
    teacher_ids: [],
    teacher_other:
      row.teacher_other != null && String(row.teacher_other).trim()
        ? String(row.teacher_other).trim()
        : null,
    class_schedules: [],
    next_class_at: nextClassAt,
    class_duration_minutes: classDurationMinutes,
    link_copy_count: Number(row.link_copy_count) || 0,
    uploaded_at: String(row.uploaded_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function attachTeachersAndSchedules(
  db: D1Database,
  lessons: JpLessonRecord[]
): Promise<JpLessonRecord[]> {
  if (!lessons.length) return lessons;
  const linkMap = await getLessonTeacherIdsByLessonIds(
    db,
    lessons.map((l) => l.id)
  );
  const scheduleMap = await getClassSchedulesByLessonIds(
    db,
    lessons.map((l) => l.id)
  );
  return lessons.map((lesson) => {
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
      teacher_ids: linkMap.get(lesson.id) ?? [],
      class_schedules: legacySchedules,
      next_class_at: first?.class_at ?? null,
      class_duration_minutes: first?.duration_minutes ?? null,
    };
  });
}

function slimFullLesson(lesson: JpLessonRecord): JpLessonRecord {
  return {
    ...lesson,
    content: truncateLessonContentForSchedule(lesson.content),
    meanings: null,
    annotations: null,
    example_sentences: null,
  };
}

/** 日程管理：轻量课表（无释义/标注/例句，content 仅预览） */
export async function listJpLessonsForSchedule(
  db: D1Database
): Promise<JpLessonRecord[]> {
  if (isJpLessonDevStoreEnabled()) {
    const full = await listJpLessons(db);
    return full.map(slimFullLesson);
  }

  await ensureJpLessonSchemaColumns(db);

  const result = await db
    .prepare(
      `${SCHEDULE_LESSON_SELECT}
       ORDER BY
         CASE
           WHEN completed = 1 THEN 2
           WHEN learning = 1 THEN 0
           ELSE 1
         END ASC,
         COALESCE(status_updated_at, uploaded_at) DESC,
         id DESC`
    )
    .all<Record<string, unknown>>();

  const mapped = (result.results || []).map(mapScheduleRow);
  mapped.sort(compareJpLessonsByProgress);
  return attachTeachersAndSchedules(db, mapped);
}
