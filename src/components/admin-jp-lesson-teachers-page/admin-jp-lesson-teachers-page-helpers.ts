/** Extracted from AdminJpLessonTeachersPage.tsx. */
import type { Locale } from "@/i18n/messages";
import type { LessonTeacherSubject } from "@/lib/locale-path";
import type { JpLessonTeacher } from "@/lib/types";
import { resolveLessonTeacherRateFields } from "@/lib/jp-lesson-teacher-rate";
import { JP_LESSON_CLASS_DURATION_MINUTES } from "@/lib/jp-lesson-shared";

export type TeacherSearchHit = {
  teacher: JpLessonTeacher;
  subject: LessonTeacherSubject;
};

export type PendingSearchFocus = {
  draft: string;
  applied: string;
  teacherId: number | null;
};

export function scoreClass(score: number): string {
  if (score >= 8) return "etr-score--high";
  if (score <= 3) return "etr-score--low";
  return "etr-score--mid";
}

export type SortOrder = "asc" | "desc";
export type TeacherSortKey =
  | "id"
  | "name"
  | "lessonCount"
  | "rate"
  | "minutes"
  | "hourlyEquiv"
  | "score"
  | "remark"
  | "updated";

/** 按课时费和课时时长计算折合时薪：hourly_rate / lesson_minutes * 60 */
export function calcEquivalentHourlyRate(teacher: JpLessonTeacher): number | null {
  const resolved = resolveLessonTeacherRateFields(teacher);
  if (resolved.hourly_rate == null || resolved.lesson_minutes == null) return null;
  if (resolved.lesson_minutes <= 0) return null;
  return Math.round((resolved.hourly_rate / resolved.lesson_minutes) * 60 * 100) / 100;
}

export const LESSON_MINUTE_OPTIONS = JP_LESSON_CLASS_DURATION_MINUTES;
/** 填写「元/小时」课时费时，未选手动时长则默认按 1 小时计 */
export const DEFAULT_HOURLY_LESSON_MINUTES = 60;

export function formatLessonMinuteOptionLabel(minutes: number, locale: "zh" | "en"): string {
  if (locale === "zh" && minutes === 60) return "60 分钟（1 小时）";
  return locale === "zh" ? `${minutes} 分钟` : `${minutes} min`;
}

export function isPositiveHourlyRate(value: string): boolean {
  const rate = Number(value.trim());
  return Number.isFinite(rate) && rate > 0;
}

/** 有课时费且时长未选时，默认 1 小时 */
export function defaultLessonMinutesWhenRateSet(
  hourlyRate: string,
  lessonMinutes: string
): string {
  if (!isPositiveHourlyRate(hourlyRate) || lessonMinutes.trim()) {
    return lessonMinutes;
  }
  return String(DEFAULT_HOURLY_LESSON_MINUTES);
}

export function resolveLessonMinutesForSave(
  hourlyRate: string,
  lessonMinutes: string,
  fallback: number | null
): number | null {
  if (lessonMinutes.trim()) return Number(lessonMinutes);
  if (isPositiveHourlyRate(hourlyRate)) return DEFAULT_HOURLY_LESSON_MINUTES;
  return fallback;
}

export function formatTeacherRateRmbOnly(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  const rounded = Math.round(rate * 100) / 100;
  const num = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
  return `${num} RMB`;
}

export function compareNullableNumber(a: number | null, b: number | null, order: SortOrder): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return order === "desc" ? b - a : a - b;
}

export function compareString(a: string, b: string, order: SortOrder): number {
  const result = a.localeCompare(b, "zh-CN", { sensitivity: "base" });
  return order === "desc" ? -result : result;
}

export function nextSortOrder(currentKey: TeacherSortKey, key: TeacherSortKey, current: SortOrder): SortOrder {
  if (currentKey === key) return current === "asc" ? "desc" : "asc";
  if (key === "name" || key === "remark") return "asc";
  return "desc";
}

export function mapCreateTeacherUserError(err: string, locale: "zh" | "en"): string {
  if (err === "user_exists" || err === "username_taken") {
    return locale === "zh"
      ? "用户名已被占用，请在用户管理中手动关联"
      : "Username taken; link manually in Users";
  }
  if (err === "username_unavailable") {
    return locale === "zh" ? "无法生成可用用户名" : "Could not derive a valid username";
  }
  if (err === "username_invalid" || err === "teacher_name_empty") {
    return locale === "zh"
      ? "老师名称无效，无法生成用户名"
      : "Invalid teacher name; cannot derive username";
  }
  if (/Cannot read properties of|reading 'length'|reading 'map'|reading 'trim'/i.test(err)) {
    return locale === "zh"
      ? "创建账号时内部错误，请刷新后重试；仍失败请到用户管理手动创建"
      : "Internal error while creating account; refresh and retry, or create manually in Users";
  }
  return err;
}
