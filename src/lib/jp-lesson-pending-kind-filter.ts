/**
 * 日语新课「未完成」区：按类型（单词 / 语法）筛选；localStorage 记忆。
 */

import { normalizeJpLessonKind } from "@/lib/jp-lesson-shared";
import type { JpLessonDisplayGroup } from "@/lib/jp-lesson-shared";
import type { JpLessonKind } from "@/lib/types";

export type JpLessonPendingKindFilter = "all" | "word" | "grammar";

export const JP_LESSON_PENDING_KIND_FILTER_KEY = "jp-lesson:pending-kind-filter";

function isJpLessonPendingKindFilter(
  value: string | null
): value is JpLessonPendingKindFilter {
  return value === "all" || value === "word" || value === "grammar";
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

export function jpLessonMatchesPendingKindFilter(
  kind: JpLessonKind | string | null | undefined,
  filter: JpLessonPendingKindFilter
): boolean {
  if (filter === "all") return true;
  const normalized = normalizeJpLessonKind(kind);
  if (filter === "word") return normalized === "word";
  // 语法：含历史 word_grammar（合传已拆成两条后几乎只剩 grammar）
  return normalized !== "word";
}

export function filterJpLessonsByPendingKind<
  T extends { kind?: JpLessonKind | string | null },
>(lessons: T[], filter: JpLessonPendingKindFilter): T[] {
  if (filter === "all") return lessons;
  return lessons.filter((lesson) =>
    jpLessonMatchesPendingKindFilter(lesson.kind, filter)
  );
}

export function filterJpLessonDisplayGroupsByPendingKind<
  T extends { id: number; kind?: JpLessonKind | string | null },
>(
  groups: JpLessonDisplayGroup<T>[],
  filter: JpLessonPendingKindFilter
): JpLessonDisplayGroup<T>[] {
  if (filter === "all") return groups;
  return groups
    .map((group) => ({
      ...group,
      lessons: group.lessons.filter((lesson) =>
        jpLessonMatchesPendingKindFilter(lesson.kind, filter)
      ),
    }))
    .filter((group) => group.lessons.length > 0);
}

export function countJpLessonsByPendingKind<
  T extends { kind?: JpLessonKind | string | null },
>(
  lessons: T[]
): { all: number; word: number; grammar: number } {
  let word = 0;
  let grammar = 0;
  for (const lesson of lessons) {
    if (jpLessonMatchesPendingKindFilter(lesson.kind, "word")) word += 1;
    else grammar += 1;
  }
  return { all: lessons.length, word, grammar };
}
