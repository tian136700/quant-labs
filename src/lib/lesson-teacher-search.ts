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
  /** 日语老师 / 英语老师 等，便于不切类型也能按科目搜 */
  subjectLabels?: string | null;
};

/** 科目写入搜索 haystack 的关键词（中英均可命中） */
export function lessonTeacherSubjectSearchLabels(subject: "jp" | "en"): string {
  return subject === "en"
    ? "英语老师 english en"
    : "日语老师 japanese jp";
}

/** 老师模糊搜索 haystack：名称、ID、上课频次、课时费、时长、科目等 */
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
    fields.subjectLabels ?? "",
  ];
  return parts
    .filter((part) => Boolean(part && part.trim()))
    .join("\n")
    .toLowerCase();
}

/** 老师选择器展示名（与 JpLessonTeacherSinglePicker 一致） */
export function lessonTeacherPickerName(teacher: JpLessonTeacher): string {
  return resolveLessonTeacherRateFields(teacher).name;
}

/** 按选择器展示名精确匹配已有老师 */
export function findLessonTeacherByPickerName<T extends JpLessonTeacher>(
  teachers: T[],
  name: string
): T | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return teachers.find((teacher) => lessonTeacherPickerName(teacher) === trimmed);
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
