/**
 * `/en-lesson` 表头排序（除「教案操作」列）。
 * 默认仍按上课时间升序；点其它列切换 key，同 key 再点切换升/降。
 */

import {
  buildEnLessonDisplayGroups,
  enLessonRecentOperationAt,
  getLessonEarliestClassAt,
  getEnLessonProgressStatus,
  normalizeClassAtForCompare,
  parseLessonContent,
  type EnLessonClassTimeSortOrder,
  type EnLessonDisplayGroup,
  type EnLessonProgressStatus,
} from "@/lib/en-lesson-shared";
import { displayEnVocabCategory } from "@/lib/en-vocab-category";
import type { EnLessonRecord } from "@/lib/types";

export type EnLessonTableSortKey =
  | "id"
  | "kind"
  | "category"
  | "content"
  | "meanings"
  | "count"
  | "uploaded"
  | "recent"
  | "operator"
  | "teacher"
  | "classTime"
  | "status"
  | "notes";

export type EnLessonTableSort = {
  key: EnLessonTableSortKey;
  dir: EnLessonClassTimeSortOrder;
};

export const DEFAULT_EN_LESSON_TABLE_SORT: EnLessonTableSort = {
  key: "classTime",
  dir: "asc",
};

export type EnLessonTableSortContext = {
  teacherNameById?: Map<number, string>;
  noteCountByLesson?: Map<number, number>;
};

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "zh-CN", { sensitivity: "base", numeric: true });
}

function teacherSortLabel(
  lesson: EnLessonRecord,
  teacherNameById?: Map<number, string>
): string {
  const names = (lesson.teacher_ids ?? [])
    .map((id) => teacherNameById?.get(id) || String(id))
    .filter(Boolean);
  const other = (lesson.teacher_other || "").trim();
  return [...names, other].filter(Boolean).join(", ");
}

function compareEnLessonsByTableKey(
  a: EnLessonRecord,
  b: EnLessonRecord,
  key: EnLessonTableSortKey,
  ctx?: EnLessonTableSortContext
): number {
  switch (key) {
    case "id":
      return a.id - b.id;
    case "kind":
      return cmpText(a.kind || "", b.kind || "");
    case "category":
      return cmpText(
        displayEnVocabCategory(a.category),
        displayEnVocabCategory(b.category)
      );
    case "content":
      return cmpText((a.content || "").trim(), (b.content || "").trim());
    case "meanings":
      return cmpText((a.meanings || "").trim(), (b.meanings || "").trim());
    case "count":
      return parseLessonContent(a.content).length - parseLessonContent(b.content).length;
    case "uploaded":
      return (a.uploaded_at || "").localeCompare(b.uploaded_at || "");
    case "recent":
      return enLessonRecentOperationAt(a).localeCompare(enLessonRecentOperationAt(b));
    case "operator":
      return cmpText(
        (a.status_updated_by || "").trim(),
        (b.status_updated_by || "").trim()
      );
    case "teacher":
      return cmpText(
        teacherSortLabel(a, ctx?.teacherNameById),
        teacherSortLabel(b, ctx?.teacherNameById)
      );
    case "classTime": {
      const aAt = getLessonEarliestClassAt(a);
      const bAt = getLessonEarliestClassAt(b);
      if (!aAt && !bAt) {
        return enLessonRecentOperationAt(b).localeCompare(enLessonRecentOperationAt(a)) ||
          b.id - a.id;
      }
      if (!aAt) return 1;
      if (!bAt) return -1;
      return normalizeClassAtForCompare(aAt).localeCompare(normalizeClassAtForCompare(bAt));
    }
    case "status": {
      const rank = (s: EnLessonProgressStatus) =>
        s === "learning" ? 0 : s === "pending" ? 1 : 2;
      return (
        rank(getEnLessonProgressStatus(a)) - rank(getEnLessonProgressStatus(b))
      );
    }
    case "notes": {
      const na = ctx?.noteCountByLesson?.get(a.id) ?? 0;
      const nb = ctx?.noteCountByLesson?.get(b.id) ?? 0;
      return na - nb;
    }
  }
}

export function sortEnLessonsByTable(
  lessons: EnLessonRecord[],
  sort: EnLessonTableSort,
  ctx?: EnLessonTableSortContext
): EnLessonRecord[] {
  const mul = sort.dir === "asc" ? 1 : -1;
  return [...lessons].sort((a, b) => {
    const diff = compareEnLessonsByTableKey(a, b, sort.key, ctx);
    if (diff !== 0) return diff * mul;
    return b.id - a.id;
  });
}

/**
 * 按表头排序后建展示组。上课时间排序时仍合并同老师同档期；其它列按课次单独一行。
 */
export function buildEnLessonDisplayGroupsForTableSort(
  lessons: EnLessonRecord[],
  sort: EnLessonTableSort,
  ctx?: EnLessonTableSortContext
): EnLessonDisplayGroup<EnLessonRecord>[] {
  if (sort.key === "classTime") {
    return buildEnLessonDisplayGroups(lessons, sort.dir);
  }
  const sorted = sortEnLessonsByTable(lessons, sort, ctx);
  return sorted.map((lesson) => ({
    key: `solo-${lesson.id}`,
    mergeKey: null,
    lessons: [lesson],
  }));
}

export function nextEnLessonTableSort(
  prev: EnLessonTableSort,
  key: EnLessonTableSortKey
): EnLessonTableSort {
  if (prev.key === key) {
    return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
  }
  // 新列默认：时间类升序，文本/最近操作降序更常用
  if (key === "classTime" || key === "uploaded" || key === "id" || key === "count") {
    return { key, dir: "asc" };
  }
  if (key === "recent") return { key, dir: "desc" };
  return { key, dir: "asc" };
}
