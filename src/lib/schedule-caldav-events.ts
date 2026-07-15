import "server-only";

import { listEnLessons } from "@/lib/en-lesson-db";
import { flattenEnLessonScheduleEvents } from "@/lib/en-lesson-shared";
import { listEnLessonTeachers } from "@/lib/en-lesson-teacher-db";
import { listJpLessons } from "@/lib/jp-lesson-db";
import {
  flattenJpLessonScheduleEvents,
  formatLessonContentLines,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";
import { listJpLessonManualSchedules } from "@/lib/jp-lesson-manual-schedule-db";
import { listJpLessonTeachers } from "@/lib/jp-lesson-teacher-db";

export const SCHEDULE_CALDAV_UID_DOMAIN = "info-quests.schedule";

export type ScheduleCalDavEventSubject = "jp" | "en" | "manual";

export type ScheduleCalDavEvent = {
  uid: string;
  subject: ScheduleCalDavEventSubject;
  summary: string;
  description: string;
  class_at: string;
  duration_minutes: number;
  teachers: string;
  title: string;
  lesson_id?: number;
  schedule_id?: number;
  manual_id?: number;
  note?: string;
};

function teacherNameMap(
  teachers: Array<{ id: number; name: string }>
): Map<number, string> {
  const map = new Map<number, string>();
  for (const teacher of teachers) {
    map.set(teacher.id, teacher.name);
  }
  return map;
}

function formatLessonTeachers(
  lesson: {
    teacher_ids?: number[];
    teacher_other?: string | null;
  },
  nameById: Map<number, string>
): string {
  const names = (lesson.teacher_ids ?? [])
    .map((id) => nameById.get(id))
    .filter((name): name is string => Boolean(name));
  if (lesson.teacher_other?.trim()) {
    names.push(lesson.teacher_other.trim());
  }
  return names.length ? names.join("、") : "未指定";
}

function contentPreview(content: string, maxLen = 40): string {
  const first = formatLessonContentLines(content, 3)[0] ?? content.trim();
  if (first.length <= maxLen) return first;
  return `${first.slice(0, maxLen - 1)}…`;
}

function buildDescription(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

export async function listScheduleCalDavEvents(
  db: D1Database
): Promise<ScheduleCalDavEvent[]> {
  const [jpLessons, enLessons, manuals, jpTeachers, enTeachers] =
    await Promise.all([
      listJpLessons(db),
      listEnLessons(db),
      listJpLessonManualSchedules(db),
      listJpLessonTeachers(db),
      listEnLessonTeachers(db),
    ]);

  const jpNameById = teacherNameMap(jpTeachers);
  const enNameById = teacherNameMap(enTeachers);
  const jpLessonById = new Map(jpLessons.map((lesson) => [lesson.id, lesson]));
  const enLessonById = new Map(enLessons.map((lesson) => [lesson.id, lesson]));

  const events: ScheduleCalDavEvent[] = [];

  for (const event of flattenJpLessonScheduleEvents(jpLessons)) {
    const lesson = jpLessonById.get(event.lessonId);
    if (!lesson) continue;
    const teachers = formatLessonTeachers(lesson, jpNameById);
    const title = lesson.content.trim() || `日语课 #${lesson.id}`;
    const preview = contentPreview(title);
    events.push({
      uid: `jp-lesson-${event.lessonId}-${event.scheduleId}@${SCHEDULE_CALDAV_UID_DOMAIN}`,
      subject: "jp",
      summary: `日语课 · ${preview}`,
      description: buildDescription([
        `老师：${teachers}`,
        title,
        lesson.teacher_other ? `其他：${lesson.teacher_other}` : null,
      ]),
      class_at: event.classAt,
      duration_minutes: event.durationMinutes,
      teachers,
      title,
      lesson_id: event.lessonId,
      schedule_id: event.scheduleId,
    });
  }

  for (const event of flattenEnLessonScheduleEvents(enLessons)) {
    const lesson = enLessonById.get(event.lessonId);
    if (!lesson) continue;
    const teachers = formatLessonTeachers(lesson, enNameById);
    const title = lesson.content.trim() || `英语课 #${lesson.id}`;
    const preview = contentPreview(title);
    events.push({
      uid: `en-lesson-${event.lessonId}-${event.scheduleId}@${SCHEDULE_CALDAV_UID_DOMAIN}`,
      subject: "en",
      summary: `英语课 · ${preview}`,
      description: buildDescription([
        `老师：${teachers}`,
        title,
        lesson.teacher_other ? `其他：${lesson.teacher_other}` : null,
      ]),
      class_at: event.classAt,
      duration_minutes: event.durationMinutes,
      teachers,
      title,
      lesson_id: event.lessonId,
      schedule_id: event.scheduleId,
    });
  }

  for (const manual of manuals) {
    const title = manual.title.trim() || `手动日程 #${manual.id}`;
    const teachers = manual.teacher.trim() || "手动日程";
    events.push({
      uid: `manual-${manual.id}@${SCHEDULE_CALDAV_UID_DOMAIN}`,
      subject: "manual",
      summary: title,
      description: buildDescription([
        `老师/对象：${teachers}`,
        manual.note.trim() || null,
      ]),
      class_at: manual.class_at,
      duration_minutes: resolveClassDurationMinutes(manual.duration_minutes),
      teachers,
      title,
      manual_id: manual.id,
      note: manual.note.trim() || undefined,
    });
  }

  events.sort((a, b) => a.class_at.localeCompare(b.class_at));
  return events;
}
