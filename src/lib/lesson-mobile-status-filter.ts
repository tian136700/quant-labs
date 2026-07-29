/** 新课状态 Tab（学习中 / 未完成 / 已完成；手机+桌面共用）localStorage 记忆 */

export type LessonMobileStatusFilter = "pending" | "learning" | "completed";

/** 日语新课额外快捷 Tab：按上课时间窗口对照北京时间的「上课中」 */
export type JpLessonListFilter = LessonMobileStatusFilter | "in_class";

export const JP_LESSON_MOBILE_STATUS_FILTER_KEY = "jp-lesson:mobile-status-filter";

export const EN_LESSON_MOBILE_STATUS_FILTER_KEY = "en-lesson:mobile-status-filter";

function isLessonMobileStatusFilter(value: string | null): value is LessonMobileStatusFilter {
  return value === "pending" || value === "learning" || value === "completed";
}

function isJpLessonListFilter(value: string | null): value is JpLessonListFilter {
  return isLessonMobileStatusFilter(value) || value === "in_class";
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

export function readStoredJpLessonListFilter(
  fallback: JpLessonListFilter = "learning"
): JpLessonListFilter {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(JP_LESSON_MOBILE_STATUS_FILTER_KEY);
    return isJpLessonListFilter(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJpLessonListFilter(status: JpLessonListFilter): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(JP_LESSON_MOBILE_STATUS_FILTER_KEY, status);
  } catch {
    /* ignore quota / private mode */
  }
}
