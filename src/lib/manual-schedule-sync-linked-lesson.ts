/**
 * 日程关联教材 → 新课「学习中」+ 上课时间/老师。
 * 日语 / 英语 POST 形状相同，仅 API 路径不同。
 * 上课时间默认与已有时段合并去重（追加），避免覆盖多时段。
 */

import type { Locale } from "@/i18n/messages";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { findLessonTeacherByPickerName } from "@/lib/lesson-teacher-search";
import type { ManualScheduleLinkedLessonSubject } from "@/lib/jp-lesson-manual-schedule-linked";
import {
  mergeLessonClassSchedulesAppend,
  type LessonClassScheduleInput,
} from "@/lib/en-lesson-import-schedule";
import type { EnLessonRecord, JpLessonRecord, JpLessonTeacher } from "@/lib/types";

export type SyncManualScheduleLinkedLessonInput = {
  subject: ManualScheduleLinkedLessonSubject;
  lessonId: number;
  classAt: string;
  durationMinutes: number | null;
  teacherName: string;
  teachers: JpLessonTeacher[];
  locale: Locale;
  /** 教案已有上课时间；与新时段合并去重后写入 */
  existingSchedules?: LessonClassScheduleInput[];
  /**
   * 教案已有老师时不覆盖。
   * 日程详情「关联教材」默认 false（仍写入日程老师）；
   * 英语新课「引入日程」传 true。
   */
  preserveExistingTeachers?: boolean;
  lessonHasTeachers?: boolean;
};

type SyncOk = {
  ok: true;
  lesson: JpLessonRecord | EnLessonRecord;
};

type SyncFail = {
  ok: false;
  error: string;
};

function apiPath(subject: ManualScheduleLinkedLessonSubject): string {
  return subject === "en" ? "/api/en-lesson" : "/api/jp-lesson";
}

async function postLessonJson(
  subject: ManualScheduleLinkedLessonSubject,
  locale: Locale,
  body: Record<string, unknown>
): Promise<{ ok: boolean; lesson?: JpLessonRecord | EnLessonRecord; error?: string }> {
  const res = await fetch(apiPath(subject), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      [LOCALE_HEADER]: locale,
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as {
    ok: boolean;
    lesson?: JpLessonRecord | EnLessonRecord;
    error?: string;
  };
}

/**
 * 顺序：上课时间（合并追加）→ 老师（可选保留）→ 学习中。
 */
export async function syncManualScheduleLinkedLessonToLearning(
  input: SyncManualScheduleLinkedLessonInput
): Promise<SyncOk | SyncFail> {
  const classAt = input.classAt.trim();
  if (!classAt) {
    return { ok: false, error: "class_at_required" };
  }

  const classSchedules = mergeLessonClassSchedulesAppend(
    input.existingSchedules ?? [],
    {
      class_at: classAt,
      duration_minutes: input.durationMinutes,
    }
  );

  const scheduleRes = await postLessonJson(input.subject, input.locale, {
    action: "set_class_schedules",
    lesson_id: input.lessonId,
    class_schedules: classSchedules,
  });
  if (!scheduleRes.ok || !scheduleRes.lesson) {
    return {
      ok: false,
      error: scheduleRes.error || "set_class_schedules_failed",
    };
  }

  const teacherName = input.teacherName.trim();
  let latest = scheduleRes.lesson;
  const skipTeacher =
    Boolean(input.preserveExistingTeachers) && Boolean(input.lessonHasTeachers);
  if (teacherName && !skipTeacher) {
    const matched = findLessonTeacherByPickerName(input.teachers, teacherName);
    const teacherRes = await postLessonJson(input.subject, input.locale, {
      action: "set_teacher",
      lesson_id: input.lessonId,
      teacher_ids: matched ? [matched.id] : [],
      teacher_other: matched ? null : teacherName,
    });
    if (!teacherRes.ok || !teacherRes.lesson) {
      return {
        ok: false,
        error: teacherRes.error || "set_teacher_failed",
      };
    }
    latest = teacherRes.lesson;
  }

  const progressRes = await postLessonJson(input.subject, input.locale, {
    lesson_id: input.lessonId,
    progress_status: "learning",
  });
  if (!progressRes.ok || !progressRes.lesson) {
    return {
      ok: false,
      error: progressRes.error || "progress_status_failed",
    };
  }

  return { ok: true, lesson: progressRes.lesson };
}

export function syncManualScheduleLinkedLessonErrorMessage(error: string): string {
  switch (error) {
    case "class_at_required":
      return "请先选择日期和时间，再选教材";
    case "forbidden":
      return "需要管理员权限才能把教材同步到新课";
    case "not_found":
      return "教材不存在或已删除";
    case "class_at_invalid":
    case "class_duration_minutes_invalid":
      return "上课时间或时长无效";
    case "teacher_not_found":
      return "老师不存在";
    default:
      return error || "同步教材到新课失败";
  }
}
