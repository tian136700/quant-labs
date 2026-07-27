import {
  normalizeTeacherLessonMinutes,
  splitTeacherNameAndRate,
} from "@/lib/jp-lesson-teacher-rate";

/**
 * 日语新课常用老师约定默认课时长（分钟）。
 * 人员管理 `lesson_minutes` 优先；为空时按称呼回退到本表。
 * 「秦老师」口语常指库里的「琴老师」。
 */
export const JP_LESSON_TEACHER_KNOWN_DEFAULT_DURATION_MINUTES: Readonly<
  Record<string, number>
> = {
  李老师: 30,
  秦老师: 45,
  琴老师: 45,
  玉老师: 60,
  星老师: 60,
};

/** 去掉旧版「名称-80/h」后缀与末尾编号（如 李老师1 → 李老师） */
export function jpLessonTeacherBaseNameForDuration(name: string): string {
  const base = splitTeacherNameAndRate(name).name.trim();
  return base.replace(/\d+$/u, "").trim() || base;
}

/** 搜索别名：口语「秦老师」对应库里的「琴老师」 */
export const JP_LESSON_TEACHER_SEARCH_ALIASES: Readonly<
  Record<string, readonly string[]>
> = {
  琴老师: ["秦老师", "秦"],
};

export function jpLessonTeacherSearchAliasTerms(name: string): string[] {
  const base = jpLessonTeacherBaseNameForDuration(name);
  if (!base) return [];
  return [...(JP_LESSON_TEACHER_SEARCH_ALIASES[base] ?? [])];
}

export function knownJpLessonTeacherDefaultDurationMinutes(
  name: string
): number | null {
  const base = jpLessonTeacherBaseNameForDuration(name);
  if (!base) return null;
  const known = JP_LESSON_TEACHER_KNOWN_DEFAULT_DURATION_MINUTES[base];
  return known != null ? known : null;
}

/** 单名老师：常用约定优先，否则用人员管理里的时长 */
export function resolveJpLessonTeacherLessonMinutes(teacher: {
  name: string;
  lesson_minutes?: number | null;
}): number | null {
  return (
    knownJpLessonTeacherDefaultDurationMinutes(teacher.name) ??
    normalizeTeacherLessonMinutes(teacher.lesson_minutes)
  );
}

/**
 * 从已选老师推出预约弹窗默认时长：按传入顺序取第一个能解析出的时长。
 * 多老师且时长不同时，以列表靠前的为准（通常是 teacher_ids[0]）。
 */
export function resolveJpLessonDefaultDurationFromTeachers(
  teachers: Array<{ name: string; lesson_minutes?: number | null }>
): number | null {
  for (const teacher of teachers) {
    const minutes = resolveJpLessonTeacherLessonMinutes(teacher);
    if (minutes != null) return minutes;
  }
  return null;
}

export function formatJpLessonDefaultDurationFormValue(
  minutes: number | null | undefined
): string {
  if (minutes == null) return "";
  const normalized = normalizeTeacherLessonMinutes(minutes);
  return normalized != null ? String(normalized) : "";
}
