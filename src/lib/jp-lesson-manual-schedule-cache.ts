import { readClientCache, readClientCacheAge, writeClientCache } from "@/lib/client-swr-cache";
import type { JpLessonManualSchedule } from "@/lib/jp-lesson-manual-schedule";

export const JP_LESSON_MANUAL_SCHEDULE_CACHE_KEY = "jp-api:manual-schedules:v2";

/** 与词表/新课列表一致的 TTL */
export const JP_LESSON_MANUAL_SCHEDULE_TTL_MS = 45_000;

export type JpLessonManualScheduleCachePayload = {
  schedules: JpLessonManualSchedule[];
};

export function readJpLessonManualScheduleCache(): JpLessonManualSchedule[] {
  return readClientCache<JpLessonManualScheduleCachePayload>(
    JP_LESSON_MANUAL_SCHEDULE_CACHE_KEY
  )?.schedules ?? [];
}

export function syncJpLessonManualScheduleCache(
  schedules: JpLessonManualSchedule[]
): void {
  writeClientCache(JP_LESSON_MANUAL_SCHEDULE_CACHE_KEY, {
    schedules: [...schedules].sort((a, b) => a.class_at.localeCompare(b.class_at)),
  });
}

export function hasJpLessonManualScheduleCache(): boolean {
  return readClientCacheAge(JP_LESSON_MANUAL_SCHEDULE_CACHE_KEY) != null;
}
