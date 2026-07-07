import {
  JP_LESSON_CLASS_DURATION_MINUTES,
  normalizeClassDurationMinutes,
} from "@/lib/jp-lesson-shared";

const DASH_PATTERN = /[-－—]/;

function parseRateSuffix(suffix: string): {
  hourly_rate: number | null;
  lesson_minutes: number | null;
} {
  const text = suffix.trim();
  if (!text) return { hourly_rate: null, lesson_minutes: null };

  const perSession = text.match(/^([\d.]+)\s*\/\s*([\d.]+)\s*min/i);
  if (perSession) {
    const price = Number.parseFloat(perSession[1]);
    const minutes = Number.parseFloat(perSession[2]);
    const lesson_minutes = normalizeClassDurationMinutes(minutes);
    if (
      Number.isFinite(price) &&
      price > 0 &&
      lesson_minutes != null
    ) {
      return {
        hourly_rate: Math.round((price / lesson_minutes) * 60 * 100) / 100,
        lesson_minutes,
      };
    }
  }

  const perHour = text.match(/([\d.]+)\s*元?\s*\/\s*h\b/i);
  if (perHour) {
    const value = Number.parseFloat(perHour[1]);
    if (Number.isFinite(value) && value > 0) {
      return {
        hourly_rate: Math.round(value * 100) / 100,
        lesson_minutes: null,
      };
    }
  }

  return { hourly_rate: null, lesson_minutes: null };
}

/** 从旧版「名称-80/h」或「名称-60/45min」格式拆分称呼、课时费与时长 */
export function splitTeacherNameAndRate(combined: string): {
  name: string;
  hourly_rate: number | null;
  lesson_minutes: number | null;
} {
  const trimmed = combined.trim();
  const match = trimmed.match(DASH_PATTERN);
  if (!match || match.index == null || match.index <= 0) {
    return { name: trimmed, hourly_rate: null, lesson_minutes: null };
  }

  const name = trimmed.slice(0, match.index).trim();
  const ratePart = trimmed.slice(match.index + match[0].length).trim();
  const parsed = parseRateSuffix(ratePart);
  if (parsed.hourly_rate == null) {
    return { name: trimmed, hourly_rate: null, lesson_minutes: null };
  }

  return {
    name: name || trimmed,
    hourly_rate: parsed.hourly_rate,
    lesson_minutes: parsed.lesson_minutes,
  };
}

/** 按单次课金额与时长（分钟）换算每小时课时费，保留两位小数 */
export function calcHourlyRate(price: number, minutes: number): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round((price / minutes) * 60 * 100) / 100;
}

export function normalizeHourlyRate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function formatHourlyRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  const rounded = Math.round(rate * 100) / 100;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}/h`;
}

export function normalizeTeacherLessonMinutes(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  return normalizeClassDurationMinutes(Number(raw));
}

export function formatTeacherLessonMinutes(
  minutes: number | null | undefined,
  locale: "zh" | "en" = "zh"
): string {
  const normalized = normalizeTeacherLessonMinutes(minutes);
  if (normalized == null) return "—";
  if (locale === "zh" && normalized === 60) return "1小时";
  return locale === "zh" ? `${normalized}分钟` : `${normalized} min`;
}

export { JP_LESSON_CLASS_DURATION_MINUTES };

export type LessonTeacherRateFields = {
  name: string;
  hourly_rate: number | null;
  lesson_minutes: number | null;
};

export function resolveLessonTeacherRateFields(input: {
  name: string;
  hourly_rate?: number | null;
  lesson_minutes?: number | null;
}): LessonTeacherRateFields {
  const trimmedName = input.name.trim();
  const hourlyFromColumn = normalizeHourlyRate(input.hourly_rate);
  const minutesFromColumn = normalizeTeacherLessonMinutes(input.lesson_minutes);

  if (hourlyFromColumn != null) {
    return {
      name: trimmedName,
      hourly_rate: hourlyFromColumn,
      lesson_minutes: minutesFromColumn,
    };
  }

  const split = splitTeacherNameAndRate(trimmedName);
  if (split.hourly_rate != null) {
    return {
      name: split.name,
      hourly_rate: split.hourly_rate,
      lesson_minutes: minutesFromColumn ?? split.lesson_minutes,
    };
  }

  return {
    name: trimmedName,
    hourly_rate: null,
    lesson_minutes: minutesFromColumn,
  };
}

/** 统一解析 API / 缓存中的老师课时费字段 */
export function normalizeJpLessonTeacher<T extends {
  name: string;
  hourly_rate?: number | null;
  lesson_minutes?: number | null;
}>(teacher: T): T & LessonTeacherRateFields {
  const resolved = resolveLessonTeacherRateFields(teacher);
  return { ...teacher, ...resolved };
}

/** 新课/课表等前台展示：名称 + 课时费，如「李老师 - 50/h」 */
export function formatTeacherDisplayLabel(
  name: string,
  hourlyRate: number | null | undefined
): string {
  const resolved = resolveLessonTeacherRateFields({ name, hourly_rate: hourlyRate });
  if (!resolved.name) return "";
  const rate = formatHourlyRate(resolved.hourly_rate);
  if (rate === "—") return resolved.name;
  return `${resolved.name} - ${rate}`;
}
