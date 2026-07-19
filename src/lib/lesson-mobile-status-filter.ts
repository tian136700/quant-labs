/** 手机端新课状态 Tab（学习中 / 未完成 / 已完成）localStorage 记忆 */

export type LessonMobileStatusFilter = "pending" | "learning" | "completed";

export const JP_LESSON_MOBILE_STATUS_FILTER_KEY = "jp-lesson:mobile-status-filter";

function isLessonMobileStatusFilter(value: string | null): value is LessonMobileStatusFilter {
  return value === "pending" || value === "learning" || value === "completed";
}

export function readStoredLessonMobileStatusFilter(
  storageKey: string,
  fallback: LessonMobileStatusFilter = "learning"
): LessonMobileStatusFilter {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return isLessonMobileStatusFilter(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredLessonMobileStatusFilter(
  storageKey: string,
  status: LessonMobileStatusFilter
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, status);
  } catch {
    /* ignore quota / private mode */
  }
}
