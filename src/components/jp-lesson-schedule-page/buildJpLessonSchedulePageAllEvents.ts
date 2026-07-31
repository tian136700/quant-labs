import { flattenEnLessonScheduleEvents } from "@/lib/en-lesson-shared";
import {
  findDedupedLessonEventForManualLinkedCover,
  type ManualScheduleLinkedLessonSlot,
} from "@/lib/jp-lesson-manual-schedule-linked";
import {
  manualScheduleToPageEvent,
  type JpLessonManualSchedule,
} from "@/lib/jp-lesson-manual-schedule";
import { flattenJpLessonScheduleEvents } from "@/lib/jp-lesson-shared";
import type { EnLessonRecord, JpLessonRecord } from "@/lib/types";
import {
  buildLessonEventDedupKey,
  formatLessonTeacherNames,
  mergeLessonDisplayContents,
  type DayScheduleEvent,
} from "@/components/jp-lesson-schedule-page/jp-lesson-schedule-page-helpers";

type BuildArgs = {
  lessons: JpLessonRecord[];
  enLessons: EnLessonRecord[];
  lessonById: Map<number, JpLessonRecord>;
  enLessonById: Map<number, EnLessonRecord>;
  teacherNameById: Map<number, string>;
  enTeacherNameById: Map<number, string>;
  manualSchedules: JpLessonManualSchedule[];
};

/**
 * 统一日程事件列表：新课去重（同堂单词+语法）+
 * 手动关联教材且同开始时间则并入新课（不另出「手动」条）。
 */
export function buildJpLessonSchedulePageAllEvents({
  lessons,
  enLessons,
  lessonById,
  enLessonById,
  teacherNameById,
  enTeacherNameById,
  manualSchedules,
}: BuildArgs): DayScheduleEvent[] {
  const jpLessonEvents: DayScheduleEvent[] = flattenJpLessonScheduleEvents(lessons).flatMap(
    (event) => {
      const lesson = lessonById.get(event.lessonId);
      if (!lesson) return [];
      return [
        {
          key: `jp-${event.key}`,
          classAt: event.classAt,
          start: event.start,
          end: event.end,
          durationMinutes: event.durationMinutes,
          teachers: formatLessonTeacherNames(lesson, teacherNameById),
          displayContent: lesson.content,
          source: "lesson" as const,
          subject: "jp" as const,
          lessonId: event.lessonId,
          scheduleId: event.scheduleId,
          lesson: {
            id: lesson.id,
            content: lesson.content,
            ref_key: lesson.ref_key,
          },
        },
      ];
    }
  );
  const enLessonEvents: DayScheduleEvent[] = flattenEnLessonScheduleEvents(enLessons).flatMap(
    (event) => {
      const lesson = enLessonById.get(event.lessonId);
      if (!lesson) return [];
      return [
        {
          key: `en-${event.key}`,
          classAt: event.classAt,
          start: event.start,
          end: event.end,
          durationMinutes: event.durationMinutes,
          teachers: formatLessonTeacherNames(lesson, enTeacherNameById),
          displayContent: lesson.content,
          source: "lesson" as const,
          subject: "en" as const,
          lessonId: event.lessonId,
          scheduleId: event.scheduleId,
          lesson: {
            id: lesson.id,
            content: lesson.content,
            ref_key: lesson.ref_key,
          },
        },
      ];
    }
  );
  const lessonEvents = [...jpLessonEvents, ...enLessonEvents];
  const lessonSlots: ManualScheduleLinkedLessonSlot[] = lessonEvents.flatMap((event) => {
    if (event.lessonId == null) return [];
    if (event.subject !== "jp" && event.subject !== "en") return [];
    return [
      {
        subject: event.subject,
        lessonId: event.lessonId,
        classAt: event.classAt,
      },
    ];
  });
  const dedupedLessonEvents: DayScheduleEvent[] = [];
  const lessonEventByKey = new Map<string, DayScheduleEvent>();
  for (const event of lessonEvents) {
    const lesson =
      event.subject === "jp" && event.lessonId != null
        ? (lessonById.get(event.lessonId) ?? null)
        : event.subject === "en" && event.lessonId != null
          ? (enLessonById.get(event.lessonId) ?? null)
          : null;
    const dedupKey = buildLessonEventDedupKey(event, lesson);
    const existing = lessonEventByKey.get(dedupKey);
    if (existing) {
      existing.displayContent = mergeLessonDisplayContents(
        existing.displayContent,
        event.displayContent
      );
      continue;
    }
    lessonEventByKey.set(dedupKey, event);
    dedupedLessonEvents.push(event);
  }
  const manualEvents: DayScheduleEvent[] = [];
  for (const manual of manualSchedules) {
    const pageEvent = manualScheduleToPageEvent(manual);
    if (!pageEvent) continue;
    const covered = findDedupedLessonEventForManualLinkedCover(
      dedupedLessonEvents,
      manual,
      lessonSlots
    );
    if (covered) {
      covered.manualId = manual.id;
      covered.manualNote = pageEvent.manualNote;
      continue;
    }
    manualEvents.push(pageEvent);
  }
  return [...dedupedLessonEvents, ...manualEvents].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
}
