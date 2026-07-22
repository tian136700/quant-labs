import {
  JP_LESSON_CLASS_DURATION_MINUTES,
  normalizeClassDurationMinutes,
} from "@/lib/jp-lesson-shared";
import type { JpLessonTeacher } from "@/lib/types";

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
        hourly_rate: Math.round(price * 100) / 100,
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

/** 按每小时课时费与单次课时长（分钟）反算单次课金额，保留两位小数 */
export function calcLessonPrice(hourlyRate: number, minutes: number): number | null {
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return null;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round((hourlyRate / 60) * minutes * 100) / 100;
}

export function normalizeHourlyRate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

/** 从 API 请求体解析 hourly_rate（单次课金额）：有 lesson_price 时直接存金额，否则读 hourly_rate */
export function resolveLessonTeacherHourlyRateInput(body: {
  hourly_rate?: unknown;
  lesson_price?: unknown;
  lesson_minutes?: unknown;
}): number | null | undefined {
  if (body.lesson_price !== undefined) {
    return normalizeHourlyRate(body.lesson_price);
  }
  if (body.hourly_rate !== undefined) {
    return body.hourly_rate === null ? null : normalizeHourlyRate(body.hourly_rate);
  }
  return undefined;
}

export function formatHourlyRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  const rounded = Math.round(rate * 100) / 100;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}/h`;
}

/** 管理页等展示用：带 RMB 单位的每小时课时费，如 80 RMB/h */
export function formatTeacherHourlyRateDisplay(
  rate: number | null | undefined
): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  const rounded = Math.round(rate * 100) / 100;
  const num = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
  return `${num} RMB/h`;
}

export function formatLessonPriceValue(price: number): string {
  const rounded = Math.round(price * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
}

/** 前台展示用短时长，如 45 min、1h */
export function formatLessonDurationShort(
  minutes: number | null | undefined,
  locale: "zh" | "en" = "zh"
): string | null {
  const normalized = normalizeTeacherLessonMinutes(minutes);
  if (normalized == null) return null;
  if (normalized === 60) return locale === "zh" ? "1h" : "1 h";
  return `${normalized} min`;
}

export type TeacherLessonDisplayParts = {
  name: string;
  priceDuration: string | null;
};

/** 解析老师展示：称呼 + 「金额 / 时长」 */
export function resolveTeacherLessonDisplayParts(
  teacher: {
    name: string;
    hourly_rate?: number | null;
    lesson_minutes?: number | null;
  },
  locale: "zh" | "en" = "zh"
): TeacherLessonDisplayParts {
  const resolved = resolveLessonTeacherRateFields(teacher);
  if (!resolved.name) return { name: "—", priceDuration: null };

  if (resolved.hourly_rate != null && resolved.lesson_minutes != null) {
    const duration = formatLessonDurationShort(resolved.lesson_minutes, locale);
    if (duration) {
      return {
        name: resolved.name,
        priceDuration: `${formatLessonPriceValue(resolved.hourly_rate)} / ${duration}`,
      };
    }
  }

  if (resolved.hourly_rate != null) {
    const rate = formatHourlyRate(resolved.hourly_rate);
    if (rate !== "—") {
      return {
        name: resolved.name,
        priceDuration: `${formatLessonPriceValue(resolved.hourly_rate)} / h`,
      };
    }
  }

  if (resolved.lesson_minutes != null) {
    const duration = formatLessonDurationShort(resolved.lesson_minutes, locale);
    if (duration) {
      return { name: resolved.name, priceDuration: duration };
    }
  }

  return { name: resolved.name, priceDuration: null };
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
  lesson_count?: number | null;
}>(teacher: T): T & LessonTeacherRateFields {
  const resolved = resolveLessonTeacherRateFields(teacher);
  const lesson_count =
    typeof teacher.lesson_count === "number" && Number.isFinite(teacher.lesson_count)
      ? Math.max(0, Math.trunc(teacher.lesson_count))
      : undefined;
  return {
    ...teacher,
    ...resolved,
    ...(lesson_count !== undefined ? { lesson_count } : {}),
  };
}

/** 保存课程老师关联后，按增减同步本地 lesson_count */
export function adjustJpLessonTeacherLessonCounts(
  teachers: JpLessonTeacher[],
  prevTeacherIds: number[],
  nextTeacherIds: number[]
): JpLessonTeacher[] {
  const prev = new Set(prevTeacherIds);
  const next = new Set(nextTeacherIds);
  const removed = prevTeacherIds.filter((id) => !next.has(id));
  const added = nextTeacherIds.filter((id) => !prev.has(id));
  if (!removed.length && !added.length) return teachers;

  return teachers.map((teacher) => {
    if (added.includes(teacher.id)) {
      return { ...teacher, lesson_count: (teacher.lesson_count ?? 0) + 1 };
    }
    if (removed.includes(teacher.id)) {
      return {
        ...teacher,
        lesson_count: Math.max(0, (teacher.lesson_count ?? 0) - 1),
      };
    }
    return teacher;
  });
}

/** 设置老师弹窗等：上课频次高的排前面，同频次再按 sort_order / id */
export function sortJpLessonTeachersByLessonCount(
  teachers: JpLessonTeacher[]
): JpLessonTeacher[] {
  return [...teachers].sort((a, b) => {
    const countDiff = (b.lesson_count ?? 0) - (a.lesson_count ?? 0);
    if (countDiff !== 0) return countDiff;
    return a.sort_order - b.sort_order || a.id - b.id;
  });
}

export type ScheduleTeacherSubjectFromTitle = "en" | "jp" | "ko" | null;

/** 日程等老师选择器：合并日语/英语/韩语老师，按称呼去重后排序 */
export function mergeScheduleTeacherPickerLists(
  jpTeachers: JpLessonTeacher[],
  enTeachers: JpLessonTeacher[],
  koTeachers: JpLessonTeacher[] = []
): JpLessonTeacher[] {
  const byName = new Map<string, JpLessonTeacher>();
  const add = (teacher: JpLessonTeacher) => {
    const name = resolveLessonTeacherRateFields(teacher).name;
    const key = name.toLowerCase();
    if (!key || byName.has(key)) return;
    byName.set(key, teacher);
  };
  for (const teacher of jpTeachers) add(teacher);
  for (const teacher of enTeachers) add(teacher);
  for (const teacher of koTeachers) add(teacher);
  return sortJpLessonTeachersByLessonCount([...byName.values()]);
}

/**
 * 手动日程标题推断老师科目（人员管理分类）：
 * 含「韩语/韩国语」→ 韩语；「英语」→ 英语；「日语」→ 日语；否则不限。
 * 优先级：韩语 > 英语 > 日语（避免「韩语/英语」误落到日语默认）。
 */
export function detectScheduleTeacherSubjectFromTitle(
  title: string
): ScheduleTeacherSubjectFromTitle {
  const text = title.trim();
  if (!text) return null;
  if (text.includes("韩语") || text.includes("韩国语")) return "ko";
  if (text.includes("英语")) return "en";
  if (text.includes("日语")) return "jp";
  return null;
}

export function scheduleTeacherPickerListForSubject(
  subject: ScheduleTeacherSubjectFromTitle,
  jpTeachers: JpLessonTeacher[],
  enTeachers: JpLessonTeacher[],
  koTeachers: JpLessonTeacher[] = []
): JpLessonTeacher[] {
  if (subject === "en") return sortJpLessonTeachersByLessonCount(enTeachers);
  if (subject === "jp") return sortJpLessonTeachersByLessonCount(jpTeachers);
  if (subject === "ko") return sortJpLessonTeachersByLessonCount(koTeachers);
  return mergeScheduleTeacherPickerLists(jpTeachers, enTeachers, koTeachers);
}

export type LessonTeacherAddInput = {
  name: string;
  lesson_price?: number;
  lesson_minutes?: number;
};

/** 添加老师：金额与时长须同时填写或都留空 */
export function validateLessonTeacherAddRateFields(
  price: string,
  minutes: string
): string | null {
  const hasPrice = Boolean(price.trim());
  const hasMinutes = Boolean(minutes.trim());
  if (hasPrice !== hasMinutes) {
    return "金额与时长需同时填写，或都留空";
  }
  if (hasPrice && hasMinutes) {
    const normalizedPrice = normalizeHourlyRate(price);
    const normalizedMinutes = normalizeTeacherLessonMinutes(minutes);
    if (normalizedPrice == null || normalizedMinutes == null) {
      return "请填写有效的金额与分钟数";
    }
  }
  return null;
}

export function buildLessonTeacherAddInput(
  name: string,
  price: string,
  minutes: string
): LessonTeacherAddInput | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const input: LessonTeacherAddInput = { name: trimmed };
  if (price.trim() && minutes.trim()) {
    input.lesson_price = Number(price);
    input.lesson_minutes = Number(minutes);
  }
  return input;
}

/** 新课/课表等前台展示：名称 + 金额/时长，如「李老师 · 80 / 45 min」 */
export function formatTeacherDisplayLabel(
  name: string,
  hourlyRate: number | null | undefined,
  lessonMinutes?: number | null,
  locale: "zh" | "en" = "zh"
): string {
  const parts = resolveTeacherLessonDisplayParts(
    { name, hourly_rate: hourlyRate, lesson_minutes: lessonMinutes },
    locale
  );
  if (!parts.name) return "";
  if (!parts.priceDuration) return parts.name;
  return `${parts.name} · ${parts.priceDuration}`;
}

/** 新课列表/日程：名称 + 金额/时长 */
export function formatTeacherLessonDisplayLabel(
  teacher: {
    name: string;
    hourly_rate?: number | null;
    lesson_minutes?: number | null;
  },
  locale: "zh" | "en" = "zh"
): string {
  const parts = resolveTeacherLessonDisplayParts(teacher, locale);
  if (!parts.name) return "—";
  if (!parts.priceDuration) return parts.name;
  return `${parts.name} · ${parts.priceDuration}`;
}
