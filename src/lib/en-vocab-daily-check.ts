import type { EnVocabWord } from "@/lib/types";

/** 当前北京时间日期 YYYY-MM-DD（用于今日抽查次数按日归零） */
export function beijingDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 北京时间墙钟 YYYY-MM-DD HH:mm:ss（熟悉程度勾选时间；与日语一致，勿用 Worker UTC 墙钟） */
export function beijingDateTimeString(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function effectiveTodayCheckCount(
  storedCount: number,
  storedDate: string | null | undefined,
  now = new Date()
): number {
  const today = beijingDateString(now);
  if (!storedDate || storedDate !== today) return 0;
  return Math.max(0, storedCount);
}

export function nextTodayCheckCount(
  storedCount: number,
  storedDate: string | null | undefined,
  now = new Date()
): { count: number; date: string } {
  const today = beijingDateString(now);
  const count =
    storedDate === today ? Math.max(0, storedCount) + 1 : 1;
  return { count, date: today };
}

/** 全表今日抽查汇总（北京时间 0 点归零） */
export function enVocabTodayCheckStats(
  words: EnVocabWord[],
  now = new Date()
): { totalActions: number; wordCount: number } {
  let totalActions = 0;
  let wordCount = 0;
  for (const w of words) {
    const n = effectiveTodayCheckCount(
      w.today_check_count ?? 0,
      w.today_check_date,
      now
    );
    if (n > 0) {
      wordCount += 1;
      totalActions += n;
    }
  }
  return { totalActions, wordCount };
}
