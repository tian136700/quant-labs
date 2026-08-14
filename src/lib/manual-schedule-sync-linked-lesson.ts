/**
 * 日程关联教材 → 新课「学习中」+ 上课时间/老师。
 * 日语 / 英语 POST 形状相同，仅 API 路径不同。
 * 上课时间默认与已有时段合并去重（追加），避免覆盖多时段。
 *
 * 老师名未在人员管理命中时：自动 POST 创建正式老师再 set_teacher，
 * 禁止再写 teacher_other（否则名单里永远没有此人）。
 */

import type { Locale } from "@/i18n/messages";
import { readApiJson } from "@/lib/api-json";
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
  /** 本次为写课次而新建/命中的正式老师（供前端合并进人员列表） */
  ensuredTeacher?: JpLessonTeacher;
};

type SyncFail = {
  ok: false;
  error: string;
};

function apiPath(subject: ManualScheduleLinkedLessonSubject): string {
  return subject === "en" ? "/api/en-lesson" : "/api/jp-lesson";
}

function teacherAdminApiPath(subject: ManualScheduleLinkedLessonSubject): string {
  return subject === "en"
    ? "/api/admin/en-lesson-teachers"
    : "/api/admin/jp-lesson-teachers";
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
  const parsed = await readApiJson<{
    ok?: boolean;
    lesson?: JpLessonRecord | EnLessonRecord;
    error?: string;
  }>(res);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  return {
    ok: parsed.data.ok === true,
    lesson: parsed.data.lesson,
    error: parsed.data.error,
  };
}

/**
 * 人员管理命中则返回；否则创建正式老师（日程/新课入口须同一张表）。
 */
export async function ensureLessonTeacherInPersonnel(
  subject: ManualScheduleLinkedLessonSubject,
  teacherName: string,
  teachers: JpLessonTeacher[]
): Promise<
  | { ok: true; teacher: JpLessonTeacher; created: boolean }
  | { ok: false; error: string }
> {
  const name = teacherName.trim();
  if (!name) {
    return { ok: false, error: "teacher_name_required" };
  }

  const matched = findLessonTeacherByPickerName(teachers, name);
  if (matched) {
    return { ok: true, teacher: matched, created: false };
  }

  try {
    const res = await fetch(teacherAdminApiPath(subject), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const parsed = await readApiJson<{
      ok?: boolean;
      teacher?: JpLessonTeacher;
      error?: string;
    }>(res);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    const data = parsed.data;
    if (data.ok && data.teacher) {
      return { ok: true, teacher: data.teacher, created: true };
    }
    if (data.error === "name_duplicate") {
      // 并发/缓存落后：再按当前列表精确名碰一次
      const again =
        findLessonTeacherByPickerName(teachers, name) ??
        teachers.find((t) => t.name.trim() === name) ??
        null;
      if (again) return { ok: true, teacher: again, created: false };
    }
    return { ok: false, error: data.error || "create_teacher_failed" };
  } catch {
    return { ok: false, error: "create_teacher_failed" };
  }
}

/**
 * 顺序：上课时间（合并追加）→ 老师（可选保留；未匹配则入库人员管理）→ 学习中。
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
  let ensuredTeacher: JpLessonTeacher | undefined;
  const skipTeacher =
    Boolean(input.preserveExistingTeachers) && Boolean(input.lessonHasTeachers);
  if (teacherName && !skipTeacher) {
    const ensured = await ensureLessonTeacherInPersonnel(
      input.subject,
      teacherName,
      input.teachers
    );
    if (!ensured.ok) {
      return { ok: false, error: ensured.error };
    }
    ensuredTeacher = ensured.teacher;

    const teacherRes = await postLessonJson(input.subject, input.locale, {
      action: "set_teacher",
      lesson_id: input.lessonId,
      teacher_ids: [ensured.teacher.id],
      teacher_other: null,
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

  return {
    ok: true,
    lesson: progressRes.lesson,
    ...(ensuredTeacher ? { ensuredTeacher } : {}),
  };
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
    case "teacher_name_required":
      return "老师名称不能为空";
    case "create_teacher_failed":
    case "name_invalid":
      return "无法把老师写入人员管理，请重试或到人员管理手动添加";
    default:
      return error || "同步失败";
  }
}
