import "server-only";

import {
  getClassSchedulesByLessonIds,
} from "@/lib/en-lesson-class-schedule-db";
import {
  compareEnLessonsByProgress,
} from "@/lib/en-lesson-shared";
import {
  ensureEnLessonSchemaColumns,
  isEnLessonDevStoreEnabled,
  listEnLessons,
} from "@/lib/en-lesson-db";
import { getLessonTeacherIdsByLessonIds } from "@/lib/en-lesson-teacher-db";
import { normalizeEnVocabCategory } from "@/lib/en-vocab-category";
import { normalizeClassDurationMinutes } from "@/lib/jp-lesson-shared";
import { truncateLessonContentForSchedule } from "@/lib/lesson-schedule-list-shared";
import type { EnLessonRecord } from "@/lib/types";

/** 日程页：不 SELECT meanings / remarks（备注可很长） */
const SCHEDULE_LESSON_SELECT = `SELECT id, kind, content, category, title, ref_key, completed, learning,
  status_updated_at, status_updated_by, teacher_other, next_class_at, class_duration_minutes, link_copy_count, uploaded_at, created_at, updated_at FROM en_lesson`;

function mapScheduleRow(row: Record<string, unknown>): EnLessonRecord {
  const nextClassAt =
    row.next_class_at != null && String(row.next_class_at).trim()
      ? String(row.next_class_at).trim()
      : null;
  const classDurationMinutes = normalizeClassDurationMinutes(
    row.class_duration_minutes != null ? Number(row.class_duration_minutes) : null
  );

  return {
    id: Number(row.id),
    kind: row.kind === "grammar" ? "grammar" : "word",
    content: truncateLessonContentForSchedule(String(row.content ?? "")),
    meanings: null,
    annotations: null,
    example_sentences: null,
    grammar_item_count: 0,
    course_label: null,
    course_group_id: null,
    category: normalizeEnVocabCategory(
      row.category != null ? String(row.category) : null
    ),
    title: row.title != null ? String(row.title) : null,
    remarks: null,
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
  lessons: EnLessonRecord[]
): Promise<EnLessonRecord[]> {
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

function slimFullLesson(lesson: EnLessonRecord): EnLessonRecord {
  return {
    ...lesson,
    content: truncateLessonContentForSchedule(lesson.content),
    meanings: null,
    remarks: null,
  };
}

/** 日程管理：轻量课表（无释义/备注，content 仅预览；不附课堂笔记） */
export async function listEnLessonsForSchedule(
  db: D1Database
): Promise<EnLessonRecord[]> {
  if (isEnLessonDevStoreEnabled()) {
    const full = await listEnLessons(db);
    return full.map(slimFullLesson);
  }

  await ensureEnLessonSchemaColumns(db);

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
  mapped.sort(compareEnLessonsByProgress);
  return attachTeachersAndSchedules(db, mapped);
}
