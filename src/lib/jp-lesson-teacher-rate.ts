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

/** 新课/课表等前台展示：名称 + 课时费，如「李老师 - 50/h」 */
export function formatTeacherDisplayLabel(
  name: string,
  hourlyRate: number | null | undefined
): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const rate = formatHourlyRate(hourlyRate);
  if (rate === "—") return trimmed;
  return `${trimmed} - ${rate}`;
}
