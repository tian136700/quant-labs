/**
 * 日程关联英语教材：候选过滤（排除已完成）与 option 转换。
 */

import type { ManualScheduleLessonOption } from "@/lib/jp-lesson-manual-schedule-linked";
import { getEnLessonProgressStatus } from "@/lib/en-lesson-shared";
import type { EnLessonRecord } from "@/lib/types";

/** 关联教材弹窗可选进度：未完成 + 上课中（排除上课完） */
export type EnLessonScheduleLinkPickStatus = "pending" | "learning";

export function isEnLessonLinkableForSchedule(lesson: EnLessonRecord): boolean {
  return getEnLessonProgressStatus(lesson) !== "completed";
}

export function filterEnLessonsForScheduleLink(
  lessons: EnLessonRecord[]
): EnLessonRecord[] {
  return lessons.filter(isEnLessonLinkableForSchedule);
}

export function filterEnLessonsByLinkPickStatus(
  lessons: EnLessonRecord[],
  status: EnLessonScheduleLinkPickStatus
): EnLessonRecord[] {
  return lessons.filter(
    (lesson) => getEnLessonProgressStatus(lesson) === status
  );
}

export function enLessonToManualScheduleOption(
  lesson: EnLessonRecord
): ManualScheduleLessonOption {
  return {
    subject: "en",
    id: lesson.id,
    kind: lesson.kind === "grammar" ? "grammar" : "word",
    content: lesson.content,
    title: lesson.title,
    course_label: lesson.course_label,
    uploaded_at: lesson.uploaded_at || lesson.created_at || "",
    completed: lesson.completed,
    learning: lesson.learning,
  };
}
