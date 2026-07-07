import { patchClientCache, readClientCache } from "@/lib/client-swr-cache";
import { JP_LESSON_CACHE_KEY, type JpLessonApiPayload } from "@/lib/jp-api-cache";
import { normalizeJpLessonTeacher } from "@/lib/jp-lesson-teacher-rate";
import type { JpLessonTeacher } from "@/lib/types";

function sortTeachers(teachers: JpLessonTeacher[]): JpLessonTeacher[] {
  return [...teachers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

/** 新课页 localStorage 缓存中的老师列表（与「上课老师管理」共用同一份 DB 数据） */
export function readJpLessonTeachersCache(): JpLessonTeacher[] {
  const cached = readClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY);
  if (!cached?.teachers?.length) return [];
  return sortTeachers(cached.teachers.map((teacher) => normalizeJpLessonTeacher(teacher)));
}

export function syncJpLessonTeachersCache(teachers: JpLessonTeacher[]): void {
  patchClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY, (prev) => ({
    ...prev,
    teachers: sortTeachers(teachers.map((teacher) => normalizeJpLessonTeacher(teacher))),
  }));
}

export function upsertJpLessonTeacherCache(teacher: JpLessonTeacher): void {
  const normalized = normalizeJpLessonTeacher(teacher);
  patchClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY, (prev) => {
    const list = prev.teachers ?? [];
    const next = sortTeachers([
      ...list.filter((item) => item.id !== normalized.id),
      normalized,
    ]);
    return { ...prev, teachers: next };
  });
}

export function removeJpLessonTeacherCache(teacherId: number): void {
  patchClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY, (prev) => ({
    ...prev,
    teachers: (prev.teachers ?? []).filter((item) => item.id !== teacherId),
  }));
}

/** 用较新的老师记录覆盖同 id 项，供跨页面打开弹窗前刷新 */
export function mergeJpLessonTeachersCache(
  primary: JpLessonTeacher[],
  updates: JpLessonTeacher[]
): JpLessonTeacher[] {
  const map = new Map(primary.map((teacher) => [teacher.id, teacher]));
  for (const teacher of updates) {
    map.set(teacher.id, normalizeJpLessonTeacher(teacher));
  }
  return sortTeachers([...map.values()]);
}
