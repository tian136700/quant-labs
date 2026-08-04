/** 人员管理：按科目合并老师行（「全部」+ 跨科搜索）。 */
import type { LessonTeacherSubject } from "@/lib/locale-path";
import type { JpLessonTeacher } from "@/lib/types";
import {
  filterLessonTeachersBySearch,
  lessonTeacherSubjectSearchLabels,
  type LessonTeacherSearchFields,
} from "@/lib/lesson-teacher-search";
import type { TeacherSearchHit } from "@/components/admin-jp-lesson-teachers-page/admin-jp-lesson-teachers-page-helpers";
import { LESSON_TEACHER_SUBJECTS } from "@/lib/lesson-teacher-subject";

export type TeachersBySubject = Partial<Record<LessonTeacherSubject, JpLessonTeacher[]>>;

export function teacherRowKey(subject: LessonTeacherSubject, id: number): string {
  return `${subject}:${id}`;
}

export function flattenTeachersBySubject(
  bySubject: TeachersBySubject,
  subjects: readonly LessonTeacherSubject[] = LESSON_TEACHER_SUBJECTS
): TeacherSearchHit[] {
  const hits: TeacherSearchHit[] = [];
  for (const subject of subjects) {
    const list = bySubject[subject];
    if (!list?.length) continue;
    for (const teacher of list) {
      hits.push({ teacher, subject });
    }
  }
  return hits;
}

export function buildTeacherSearchFieldsByRowKey(
  hits: TeacherSearchHit[],
  remarkByRowKey?: ReadonlyMap<string, string>
): Map<string, LessonTeacherSearchFields> {
  const map = new Map<string, LessonTeacherSearchFields>();
  for (const hit of hits) {
    const key = teacherRowKey(hit.subject, hit.teacher.id);
    map.set(key, {
      remark: remarkByRowKey?.get(key) ?? "",
      subjectLabels: lessonTeacherSubjectSearchLabels(hit.subject),
    });
  }
  return map;
}

/** 按行过滤（科目+id），避免三科 id 撞号时串台 */
export function filterTeacherHitsBySearch(
  hits: TeacherSearchHit[],
  query: string,
  fieldsByRowKey?: ReadonlyMap<string, LessonTeacherSearchFields>
): TeacherSearchHit[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return hits;

  return hits.filter((hit) => {
    const key = teacherRowKey(hit.subject, hit.teacher.id);
    const fields = fieldsByRowKey?.get(key);
    const matched = filterLessonTeachersBySearch(
      [hit.teacher],
      query,
      fields
        ? new Map([[hit.teacher.id, fields]])
        : undefined
    );
    return matched.length > 0;
  });
}

export function upsertTeacherInSubjectMap(
  prev: TeachersBySubject,
  subject: LessonTeacherSubject,
  teacher: JpLessonTeacher
): TeachersBySubject {
  const list = prev[subject] ?? [];
  const nextList = list.some((item) => item.id === teacher.id)
    ? list.map((item) => (item.id === teacher.id ? teacher : item))
    : [...list, teacher];
  return { ...prev, [subject]: nextList };
}

export function removeTeacherFromSubjectMap(
  prev: TeachersBySubject,
  subject: LessonTeacherSubject,
  id: number
): TeachersBySubject {
  const list = prev[subject];
  if (!list?.length) return prev;
  return { ...prev, [subject]: list.filter((teacher) => teacher.id !== id) };
}
