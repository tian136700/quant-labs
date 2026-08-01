/**
 * 日语新课 → 统一日程 / ICS 事件构建（学习中 + 已完成才进日程）。
 */

import {
  getJpLessonProgressStatus,
  getLessonClassSchedules,
  parseBeijingDateTime,
  resolveClassDurationMinutes,
} from "@/lib/jp-lesson-shared";

export type JpLessonScheduleEvent = {
  key: string;
  lessonId: number;
  scheduleId: number;
  classAt: string;
  start: Date;
  end: Date;
  durationMinutes: number;
};

/** 日程 / ICS：学习中 + 已完成进日程；未上课不同步（上完课仍应留在当天列） */
export function jpLessonProgressAppearsOnSchedule(lesson: {
  completed?: boolean;
  learning?: boolean;
}): boolean {
  const status = getJpLessonProgressStatus({
    completed: Boolean(lesson.completed),
    learning: Boolean(lesson.learning),
  });
  return status === "learning" || status === "completed";
}

export function buildJpLessonScheduleEvents(lesson: {
  id: number;
  /** 学习中 + 已完成进入日程 / ICS；未上课不同步 */
  completed?: boolean;
  learning?: boolean;
  class_schedules?: Array<{
    id: number;
    class_at: string;
    duration_minutes: number | null;
  }>;
  next_class_at?: string | null;
  class_duration_minutes?: number | null;
}): JpLessonScheduleEvent[] {
  if (!jpLessonProgressAppearsOnSchedule(lesson)) {
    return [];
  }
  const events: JpLessonScheduleEvent[] = [];
  for (const schedule of getLessonClassSchedules(lesson)) {
    const start = parseBeijingDateTime(schedule.class_at);
    if (!start) continue;
    const durationMinutes = resolveClassDurationMinutes(schedule.duration_minutes);
    events.push({
      key: `${lesson.id}-${schedule.id}-${schedule.class_at}`,
      lessonId: lesson.id,
      scheduleId: schedule.id,
      classAt: schedule.class_at,
      start,
      end: new Date(start.getTime() + durationMinutes * 60_000),
      durationMinutes,
    });
  }
  return events;
}

export function flattenJpLessonScheduleEvents(
  lessons: Array<Parameters<typeof buildJpLessonScheduleEvents>[0]>
): JpLessonScheduleEvent[] {
  return lessons
    .flatMap((lesson) => buildJpLessonScheduleEvents(lesson))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export type JpLessonScheduleEventStatus = "past" | "ongoing" | "upcoming";

export function getJpLessonScheduleEventStatus(
  event: { start: Date; end: Date },
  now = new Date()
): JpLessonScheduleEventStatus {
  const ts = now.getTime();
  if (ts >= event.end.getTime()) return "past";
  if (ts >= event.start.getTime()) return "ongoing";
  return "upcoming";
}
