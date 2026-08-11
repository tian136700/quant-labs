/**
 * 日语新课「未完成」区：按类型（单词 / 语法）+ 有无教材筛选；localStorage 记忆。
 */

import { normalizeJpLessonKind } from "@/lib/jp-lesson-shared";
import type { JpLessonDisplayGroup } from "@/lib/jp-lesson-shared";
import type { JpLessonKind } from "@/lib/types";

export type JpLessonPendingKindFilter =
  | "all"
  | "word"
  | "word_with_course"
  | "word_without_course"
  | "grammar"
  | "grammar_with_course"
  | "grammar_without_course";

export type JpLessonPendingKindBase = "word" | "grammar";

export type JpLessonPendingCourseScope = "all" | "with_course" | "without_course";

export type JpLessonPendingKindCounts = {
  all: number;
  word: number;
  word_with_course: number;
  word_without_course: number;
  grammar: number;
  grammar_with_course: number;
  grammar_without_course: number;
};

export const JP_LESSON_PENDING_KIND_FILTER_KEY = "jp-lesson:pending-kind-filter";

const VALID_FILTERS = new Set<string>([
  "all",
  "word",
  "word_with_course",
  "word_without_course",
  "grammar",
  "grammar_with_course",
  "grammar_without_course",
]);

function isJpLessonPendingKindFilter(
  value: string | null
): value is JpLessonPendingKindFilter {
  return value != null && VALID_FILTERS.has(value);
}

export function readStoredJpLessonPendingKindFilter(
  fallback: JpLessonPendingKindFilter = "all"
): JpLessonPendingKindFilter {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(JP_LESSON_PENDING_KIND_FILTER_KEY);
    return isJpLessonPendingKindFilter(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJpLessonPendingKindFilter(
  kind: JpLessonPendingKindFilter
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(JP_LESSON_PENDING_KIND_FILTER_KEY, kind);
  } catch {
    /* ignore quota / private mode */
  }
}

/** 有教材 = 列表「教材」列有课次名（与 StatusTable 一致：course_label 真值）。 */
export function jpLessonHasCourseLabel(
  lesson: { course_label?: string | null } | null | undefined
): boolean {
  return Boolean((lesson?.course_label || "").trim());
}

export function jpLessonPendingKindBase(
  filter: JpLessonPendingKindFilter
): JpLessonPendingKindBase | null {
  if (filter === "all") return null;
  if (filter.startsWith("word")) return "word";
  return "grammar";
}

export function jpLessonPendingCourseScope(
  filter: JpLessonPendingKindFilter
): JpLessonPendingCourseScope {
  if (filter.endsWith("_with_course")) return "with_course";
  if (filter.endsWith("_without_course")) return "without_course";
  return "all";
}

export function buildJpLessonPendingKindFilter(
  base: JpLessonPendingKindBase,
  course: JpLessonPendingCourseScope
): JpLessonPendingKindFilter {
  if (course === "with_course") return `${base}_with_course`;
  if (course === "without_course") return `${base}_without_course`;
  return base;
}

function lessonIsWordKind(kind: JpLessonKind | string | null | undefined): boolean {
  return normalizeJpLessonKind(kind) === "word";
}

export function jpLessonMatchesPendingKindFilter(
  lesson: {
    kind?: JpLessonKind | string | null;
    course_label?: string | null;
  },
  filter: JpLessonPendingKindFilter
): boolean {
  if (filter === "all") return true;
  const base = jpLessonPendingKindBase(filter);
  const isWord = lessonIsWordKind(lesson.kind);
  if (base === "word" && !isWord) return false;
  if (base === "grammar" && isWord) return false;
  const scope = jpLessonPendingCourseScope(filter);
  if (scope === "all") return true;
  const hasCourse = jpLessonHasCourseLabel(lesson);
  return scope === "with_course" ? hasCourse : !hasCourse;
}

export function filterJpLessonsByPendingKind<
  T extends {
    kind?: JpLessonKind | string | null;
    course_label?: string | null;
  },
>(lessons: T[], filter: JpLessonPendingKindFilter): T[] {
  if (filter === "all") return lessons;
  return lessons.filter((lesson) =>
    jpLessonMatchesPendingKindFilter(lesson, filter)
  );
}

export function filterJpLessonDisplayGroupsByPendingKind<
  T extends {
    id: number;
    kind?: JpLessonKind | string | null;
    course_label?: string | null;
  },
>(
  groups: JpLessonDisplayGroup<T>[],
  filter: JpLessonPendingKindFilter
): JpLessonDisplayGroup<T>[] {
  if (filter === "all") return groups;
  return groups
    .map((group) => ({
      ...group,
      lessons: group.lessons.filter((lesson) =>
        jpLessonMatchesPendingKindFilter(lesson, filter)
      ),
    }))
    .filter((group) => group.lessons.length > 0);
}

export function countJpLessonsByPendingKind<
  T extends {
    kind?: JpLessonKind | string | null;
    course_label?: string | null;
  },
>(lessons: T[]): JpLessonPendingKindCounts {
  const counts: JpLessonPendingKindCounts = {
    all: lessons.length,
    word: 0,
    word_with_course: 0,
    word_without_course: 0,
    grammar: 0,
    grammar_with_course: 0,
    grammar_without_course: 0,
  };
  for (const lesson of lessons) {
    const isWord = lessonIsWordKind(lesson.kind);
    const hasCourse = jpLessonHasCourseLabel(lesson);
    if (isWord) {
      counts.word += 1;
      if (hasCourse) counts.word_with_course += 1;
      else counts.word_without_course += 1;
    } else {
      counts.grammar += 1;
      if (hasCourse) counts.grammar_with_course += 1;
      else counts.grammar_without_course += 1;
    }
  }
  return counts;
}

export function jpLessonPendingKindFilterVisibleCount(
  counts: JpLessonPendingKindCounts,
  filter: JpLessonPendingKindFilter
): number {
  return counts[filter];
}

export function jpLessonPendingKindFilterEmptyHint(
  filter: JpLessonPendingKindFilter
): string {
  switch (filter) {
    case "word":
      return "当前没有未完成的单词课。";
    case "word_with_course":
      return "当前没有未完成的有教材单词课。";
    case "word_without_course":
      return "当前没有未完成的无教材单词课。";
    case "grammar":
      return "当前没有未完成的语法课。";
    case "grammar_with_course":
      return "当前没有未完成的有教材语法课。";
    case "grammar_without_course":
      return "当前没有未完成的无教材语法课。";
    default:
      return "暂无未完成的新课。";
  }
}

export function jpLessonPendingKindTabLabel(
  base: JpLessonPendingKindBase,
  filter: JpLessonPendingKindFilter
): string {
  const kindLabel = base === "word" ? "单词" : "语法";
  if (jpLessonPendingKindBase(filter) !== base) return kindLabel;
  const scope = jpLessonPendingCourseScope(filter);
  if (scope === "with_course") return `${kindLabel}·有教材`;
  if (scope === "without_course") return `${kindLabel}·无教材`;
  return kindLabel;
}
