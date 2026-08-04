/**
 * 英语新课「引入日程」：从手动日程里筛英语、未上完的条目，并合并上课时间。
 */

import { getJpLessonScheduleEventStatus } from "@/lib/jp-lesson-schedule-events";
import {
  resolveManualScheduleDurationMinutes,
  type JpLessonManualSchedule,
} from "@/lib/jp-lesson-manual-schedule";
import { findLessonTeacherByPickerName } from "@/lib/lesson-teacher-search";
import { parseBeijingDateTime } from "@/lib/jp-lesson-shared";
import { normalizeClassAtForCompare } from "@/lib/en-lesson-shared";
import { detectScheduleTeacherSubjectFromTitle } from "@/lib/jp-lesson-teacher-rate";
import type { JpLessonTeacher } from "@/lib/types";

export type LessonClassScheduleInput = {
  class_at: string;
  duration_minutes: number | null;
};

/** 标题或英语老师表判定为英语；日语/韩语标题一律排除 */
export function isEnglishManualScheduleForImport(
  manual: Pick<JpLessonManualSchedule, "title" | "teacher">,
  enTeachers: JpLessonTeacher[]
): boolean {
  const titleSubject = detectScheduleTeacherSubjectFromTitle(manual.title);
  if (titleSubject === "jp" || titleSubject === "ko") return false;
  if (titleSubject === "en") return true;
  const teacherName = (manual.teacher ?? "").trim();
  if (!teacherName) return false;
  return findLessonTeacherByPickerName(enTeachers, teacherName) != null;
}

/** 结束时间已过 → past，不引入 */
export function isManualScheduleNotPast(
  manual: Pick<JpLessonManualSchedule, "class_at" | "duration_minutes" | "title">,
  now = new Date()
): boolean {
  const start = parseBeijingDateTime(manual.class_at);
  if (!start) return false;
  const durationMinutes = resolveManualScheduleDurationMinutes(
    manual.title,
    manual.duration_minutes
  );
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return getJpLessonScheduleEventStatus({ start, end }, now) !== "past";
}

export function filterEnLessonImportManualSchedules(
  manuals: JpLessonManualSchedule[],
  enTeachers: JpLessonTeacher[],
  now = new Date()
): JpLessonManualSchedule[] {
  return manuals
    .filter(
      (manual) =>
        isEnglishManualScheduleForImport(manual, enTeachers) &&
        isManualScheduleNotPast(manual, now)
    )
    .sort((a, b) => a.class_at.localeCompare(b.class_at));
}

/** 按老师名收窄（空 = 全部） */
export function filterImportSchedulesByTeacherName(
  manuals: JpLessonManualSchedule[],
  teacherFilter: string
): JpLessonManualSchedule[] {
  const needle = teacherFilter.trim().toLowerCase();
  if (!needle) return manuals;
  return manuals.filter(
    (manual) => (manual.teacher ?? "").trim().toLowerCase() === needle
  );
}

/**
 * 合并上课时间：同 normalizeClassAtForCompare 去重；已有保留原时长，新时段追加。
 */
export function mergeLessonClassSchedulesAppend(
  existing: LessonClassScheduleInput[],
  incoming: LessonClassScheduleInput
): LessonClassScheduleInput[] {
  const classAt = incoming.class_at.trim();
  if (!classAt) return existing.map((row) => ({ ...row }));

  const incomingKey = normalizeClassAtForCompare(classAt);
  const out: LessonClassScheduleInput[] = [];
  const seen = new Set<string>();

  for (const row of existing) {
    const at = row.class_at.trim();
    if (!at) continue;
    const key = normalizeClassAtForCompare(at);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      class_at: at,
      duration_minutes: row.duration_minutes,
    });
  }

  if (!seen.has(incomingKey)) {
    out.push({
      class_at: classAt,
      duration_minutes: incoming.duration_minutes,
    });
  }

  out.sort((a, b) =>
    normalizeClassAtForCompare(a.class_at).localeCompare(
      normalizeClassAtForCompare(b.class_at)
    )
  );
  return out;
}

export function lessonHasAssignedTeachers(lesson: {
  teacher_ids?: number[] | null;
  teacher_other?: string | null;
}): boolean {
  if ((lesson.teacher_ids ?? []).length > 0) return true;
  return Boolean((lesson.teacher_other ?? "").trim());
}
