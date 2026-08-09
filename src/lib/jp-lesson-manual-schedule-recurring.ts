/**
 * 手动日程「长期固定」：按北京日历星期几 + 时间展开具体 class_at。
 * 存库仍是一条实例一行；CalDAV/Bark 不依赖 RRULE。
 */

export const MANUAL_SCHEDULE_RECURRING_HORIZON_WEEKS = 12;

/** 0=周日 … 6=周六（北京墙钟日期） */
export type ManualScheduleWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type JpLessonManualScheduleRecurringMeta = {
  id: number;
  weekday: ManualScheduleWeekday;
  time_hm: string;
  active: boolean;
};

const TIME_HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeManualScheduleTimeHm(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function parseClassAtDateAndTime(classAt: string): {
  dateYmd: string;
  timeHm: string;
} | null {
  const trimmed = classAt.trim();
  const m = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/
  );
  if (!m) return null;
  const timeHm = normalizeManualScheduleTimeHm(m[2]);
  if (!timeHm || !DATE_YMD_RE.test(m[1])) return null;
  return { dateYmd: m[1], timeHm };
}

/** 北京日期 YYYY-MM-DD → 星期（0=周日） */
export function beijingWeekdayFromDateString(
  dateYmd: string
): ManualScheduleWeekday | null {
  if (!DATE_YMD_RE.test(dateYmd.trim())) return null;
  // 正午避免跨日边界
  const d = new Date(`${dateYmd.trim()}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  if (day < 0 || day > 6) return null;
  return day as ManualScheduleWeekday;
}

export function formatManualScheduleClassAt(
  dateYmd: string,
  timeHm: string
): string {
  const hm = normalizeManualScheduleTimeHm(timeHm);
  if (!hm || !DATE_YMD_RE.test(dateYmd)) {
    throw new Error("invalid_class_at_parts");
  }
  return `${dateYmd} ${hm}:00`;
}

function addDaysYmd(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 从 fromDateYmd（含）起找第一个匹配 weekday 的日期 */
export function firstDateOnOrAfterWeekday(
  fromDateYmd: string,
  weekday: ManualScheduleWeekday
): string | null {
  if (!DATE_YMD_RE.test(fromDateYmd)) return null;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  for (let i = 0; i < 7; i++) {
    const ymd = addDaysYmd(fromDateYmd, i);
    if (beijingWeekdayFromDateString(ymd) === weekday) return ymd;
  }
  return null;
}

/**
 * 展开约 `weeks` 堂课的 class_at（含首堂）。
 * 从 fromDateYmd 起（含）对齐到 weekday，再每周 +7。
 */
export function expandRecurringClassAts(opts: {
  weekday: number;
  timeHm: string;
  fromDateYmd: string;
  weeks?: number;
}): string[] {
  const weeks = opts.weeks ?? MANUAL_SCHEDULE_RECURRING_HORIZON_WEEKS;
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) return [];
  if (!Number.isInteger(opts.weekday) || opts.weekday < 0 || opts.weekday > 6) {
    return [];
  }
  const timeHm = normalizeManualScheduleTimeHm(opts.timeHm);
  if (!timeHm || !TIME_HM_RE.test(timeHm)) return [];

  const first = firstDateOnOrAfterWeekday(
    opts.fromDateYmd.trim(),
    opts.weekday as ManualScheduleWeekday
  );
  if (!first) return [];

  const out: string[] = [];
  for (let i = 0; i < weeks; i++) {
    const ymd = addDaysYmd(first, i * 7);
    out.push(formatManualScheduleClassAt(ymd, timeHm));
  }
  return out;
}

export const MANUAL_SCHEDULE_WEEKDAY_LABELS_ZH = [
  "周日",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
] as const;

export function manualScheduleWeekdayLabelZh(weekday: number): string {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return "每周";
  return MANUAL_SCHEDULE_WEEKDAY_LABELS_ZH[weekday];
}

export function formatManualScheduleRecurringBadge(
  recurring: Pick<JpLessonManualScheduleRecurringMeta, "weekday" | "time_hm">
): string {
  const day = manualScheduleWeekdayLabelZh(recurring.weekday);
  const hm = normalizeManualScheduleTimeHm(recurring.time_hm) || recurring.time_hm;
  return `长期固定 · 每${day}${hm ? ` ${hm}` : ""}`;
}
