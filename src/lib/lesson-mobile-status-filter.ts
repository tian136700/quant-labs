/** 新课状态 Tab（学习中 / 未完成 / 已完成；手机+桌面共用）localStorage 记忆 */

export type LessonMobileStatusFilter = "pending" | "learning" | "completed";

/** 日语新课额外快捷 Tab：学习中且上课老师为李老师 */
export type JpLessonListFilter = LessonMobileStatusFilter | "in_class";

export const JP_LESSON_MOBILE_STATUS_FILTER_KEY = "jp-lesson:mobile-status-filter";

export const EN_LESSON_MOBILE_STATUS_FILTER_KEY = "en-lesson:mobile-status-filter";

/** 「上课中」快捷 Tab 对应的老师称呼（与人员管理基础名一致） */
export const JP_LESSON_IN_CLASS_TEACHER_BASE_NAME = "李老师";

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
