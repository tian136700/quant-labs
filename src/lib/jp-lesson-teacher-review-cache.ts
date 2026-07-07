import { readClientCache, readClientCacheAge, writeClientCache } from "@/lib/client-swr-cache";
import type { JpLessonTeacherReviewSummary } from "@/lib/types";

export const JP_LESSON_TEACHER_REVIEW_CACHE_KEY = "jp-api:lesson-teacher-review:v1";

/** 与词表/新课列表一致的 TTL */
export const JP_LESSON_TEACHER_REVIEW_TTL_MS = 45_000;

export type JpLessonTeacherReviewCachePayload = {
  summaries: JpLessonTeacherReviewSummary[];
};

export function readJpLessonTeacherReviewCache(): Map<number, JpLessonTeacherReviewSummary> {
  const cached = readClientCache<JpLessonTeacherReviewCachePayload>(
    JP_LESSON_TEACHER_REVIEW_CACHE_KEY
  );
  const map = new Map<number, JpLessonTeacherReviewSummary>();
  if (!cached?.summaries?.length) return map;
  for (const item of cached.summaries) {
    map.set(item.teacher_id, item);
  }
  return map;
}

export function syncJpLessonTeacherReviewCache(
  summaries: JpLessonTeacherReviewSummary[]
): void {
  writeClientCache(JP_LESSON_TEACHER_REVIEW_CACHE_KEY, { summaries });
}

export function hasJpLessonTeacherReviewCache(): boolean {
  return readClientCacheAge(JP_LESSON_TEACHER_REVIEW_CACHE_KEY) != null;
}
