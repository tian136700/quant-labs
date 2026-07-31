import "server-only";

import { listEnLessonTeachers } from "@/lib/en-lesson-teacher-db";
import {
  listEnLessonTeacherReviews,
  listEnLessonTeacherReviewSummaries,
} from "@/lib/en-lesson-teacher-review-db";
import type {
  EnLessonTeacher,
  EnLessonTeacherReviewRecord,
} from "@/lib/types";

/** 去掉尾缀「老师」（机构老师保留） */
export function normalizeEnTeacherLookupQuery(raw: string): string {
  let name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return "";
  if (name.endsWith("老师") && name !== "机构老师" && name.length > 2) {
    const base = name.slice(0, -2).trim();
    if (base) name = base;
  }
  return name;
}

function teacherNameKey(name: string): string {
  return normalizeEnTeacherLookupQuery(name).toLowerCase();
}

export type EnTeacherLookupMatch = {
  id: number;
  name: string;
};

export function matchEnLessonTeachersByQuery(
  teachers: EnLessonTeacher[],
  queryRaw: string
): EnTeacherLookupMatch[] {
  const q = normalizeEnTeacherLookupQuery(queryRaw);
  if (!q) return [];
  const qKey = q.toLowerCase();

  const exact = teachers.filter((t) => teacherNameKey(t.name) === qKey);
  if (exact.length === 1) {
    return exact.map((t) => ({ id: t.id, name: t.name }));
  }
  if (exact.length > 1) {
    return exact.map((t) => ({ id: t.id, name: t.name }));
  }

  // 前缀 / 包含（短查询至少 1 字；避免空）
  const fuzzy = teachers.filter((t) => {
    const key = teacherNameKey(t.name);
    return key.includes(qKey) || qKey.includes(key);
  });
  return fuzzy.map((t) => ({ id: t.id, name: t.name }));
}

export type EnTeacherLookupReviewItem = {
  class_date: string;
  score: number;
  remark: string | null;
};

export type EnTeacherLookupResult =
  | {
      ok: true;
      found: true;
      teacher: EnTeacherLookupMatch;
      avg_score: number | null;
      review_count: number;
      latest_remark: string | null;
      latest_class_date: string | null;
      reviews: EnTeacherLookupReviewItem[];
    }
  | {
      ok: true;
      found: false;
      error: "teacher_not_found";
      message: string;
      query: string;
    }
  | {
      ok: true;
      found: false;
      error: "teacher_ambiguous";
      message: string;
      query: string;
      candidates: EnTeacherLookupMatch[];
    }
  | { ok: false; error: "name_required" };

const NOT_FOUND_MESSAGE = "英语这个模块里面没有这个老师";

function mapReviewItem(r: EnLessonTeacherReviewRecord): EnTeacherLookupReviewItem {
  return {
    class_date: r.class_date,
    score: r.score,
    remark: r.remark?.trim() ? r.remark.trim() : null,
  };
}

export async function lookupEnLessonTeacherReview(
  db: D1Database,
  queryRaw: string,
  pickId?: number | null
): Promise<EnTeacherLookupResult> {
  const query = normalizeEnTeacherLookupQuery(queryRaw);
  if (!query && !(pickId != null && Number.isInteger(pickId) && pickId > 0)) {
    return { ok: false, error: "name_required" };
  }

  const teachers = await listEnLessonTeachers(db);

  let teacher: EnLessonTeacher | null = null;
  if (pickId != null && Number.isInteger(pickId) && pickId > 0) {
    teacher = teachers.find((t) => t.id === pickId) ?? null;
    if (!teacher) {
      return {
        ok: true,
        found: false,
        error: "teacher_not_found",
        message: NOT_FOUND_MESSAGE,
        query: query || String(pickId),
      };
    }
  } else {
    const matches = matchEnLessonTeachersByQuery(teachers, query);
    if (matches.length === 0) {
      return {
        ok: true,
        found: false,
        error: "teacher_not_found",
        message: NOT_FOUND_MESSAGE,
        query,
      };
    }
    if (matches.length > 1) {
      return {
        ok: true,
        found: false,
        error: "teacher_ambiguous",
        message: "匹配到多个英语老师，请回复序号选择：",
        query,
        candidates: matches.slice(0, 9),
      };
    }
    teacher = teachers.find((t) => t.id === matches[0].id) ?? null;
    if (!teacher) {
      return {
        ok: true,
        found: false,
        error: "teacher_not_found",
        message: NOT_FOUND_MESSAGE,
        query,
      };
    }
  }

  const summaries = await listEnLessonTeacherReviewSummaries(db);
  const summary = summaries.find((s) => s.teacher_id === teacher!.id);
  const reviewsRaw = await listEnLessonTeacherReviews(
    db,
    teacher.id,
    "class_date",
    "desc",
    15
  );
  const reviews = reviewsRaw.map(mapReviewItem);

  return {
    ok: true,
    found: true,
    teacher: { id: teacher.id, name: teacher.name },
    avg_score: summary?.avg_score ?? null,
    review_count: summary?.review_count ?? 0,
    latest_remark: summary?.latest_remark ?? null,
    latest_class_date: summary?.latest_class_date ?? null,
    reviews,
  };
}
