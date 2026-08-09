/**
 * 日程关联英语教材：候选过滤（排除已完成）与 option 转换。
 */

import type { ManualScheduleLessonOption } from "@/lib/jp-lesson-manual-schedule-linked";
import { getEnLessonProgressStatus } from "@/lib/en-lesson-shared";
import type { EnLessonRecord } from "@/lib/types";

/** 关联教材弹窗筛选：全部 / 未完成 / 上课中（排除上课完） */
export type EnLessonScheduleLinkPickStatus = "all" | "pending" | "learning";

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
  if (status === "all") return lessons;
  return lessons.filter(
    (lesson) => getEnLessonProgressStatus(lesson) === status
  );
}

/** 打开弹窗时：有上课中则默认看「全部」（上课中带老师，方便分辨） */
export function defaultEnLessonScheduleLinkPickStatus(
  linkable: EnLessonRecord[]
): EnLessonScheduleLinkPickStatus {
  const hasLearning = linkable.some(
    (lesson) => getEnLessonProgressStatus(lesson) === "learning"
  );
  return hasLearning ? "all" : "pending";
}

/** 上课中优先，其次按 id 新→旧，方便先看到已有上课老师的教材 */
export function sortEnLessonsForScheduleLinkPick(
  lessons: EnLessonRecord[]
): EnLessonRecord[] {
  return [...lessons].sort((a, b) => {
    const aLearning = getEnLessonProgressStatus(a) === "learning" ? 1 : 0;
    const bLearning = getEnLessonProgressStatus(b) === "learning" ? 1 : 0;
    if (aLearning !== bLearning) return bLearning - aLearning;
    return b.id - a.id;
  });
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
