import { resolveLessonTeacherRateFields } from "@/lib/jp-lesson-teacher-rate";
import type { JpLessonTeacher } from "@/lib/types";

function normalizeSearchTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export type LessonTeacherSearchFields = {
  remark?: string | null;
  /** 弹窗内未保存的名称草稿，优先于 teacher.name */
  draftName?: string;
};

/** 老师模糊搜索 haystack：名称、ID、上课频次、课时费、时长等 */
export function lessonTeacherSearchHaystack(
  teacher: JpLessonTeacher,
  fields: LessonTeacherSearchFields = {}
): string {
  const resolved = resolveLessonTeacherRateFields(teacher);
  const name = (fields.draftName ?? resolved.name).trim();
  const parts = [
    String(teacher.id),
    teacher.name,
    name,
    resolved.name,
    teacher.lesson_count != null ? String(teacher.lesson_count) : "",
    resolved.hourly_rate != null ? String(resolved.hourly_rate) : "",
    resolved.lesson_minutes != null ? String(resolved.lesson_minutes) : "",
    fields.remark ?? "",
  ];
  return parts
    .filter((part) => Boolean(part && part.trim()))
    .join("\n")
    .toLowerCase();
}

/** 本地模糊搜索：各关键词均需在 haystack 中出现（AND）；空查询返回原列表 */
export function filterLessonTeachersBySearch<T extends JpLessonTeacher>(
  teachers: T[],
  query: string,
  fieldsById?: ReadonlyMap<number, LessonTeacherSearchFields>
): T[] {
  const tokens = normalizeSearchTokens(query);
  if (!tokens.length) return teachers;

  return teachers.filter((teacher) => {
    const haystack = lessonTeacherSearchHaystack(
      teacher,
      fieldsById?.get(teacher.id)
    );
    return tokens.every((token) => haystack.includes(token));
  });
}
