import type { JpVocabWord } from "@/lib/types";

/** 当前北京时间日期 YYYY-MM-DD（用于今日抽查次数按日归零） */
export function beijingDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 北京时间次日 YYYY-MM-DD（管理员「明日优先抽查」生效日） */
export function beijingTomorrowDateString(now = new Date()): string {
  return beijingDateString(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

/** 北京时间墙钟 YYYY-MM-DD HH:mm:ss（词条入库标记时间，供次日凌晨置顶判断） */
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

/** 词条入库日（北京 YYYY-MM-DD）；取 created_at 前 10 位 */
export function jpVocabWordEnteredBeijingDate(
  createdAt: string | null | undefined
): string | null {
  const raw = (createdAt || "").trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** 历史熟悉程度合计为 0 = 从未抽查 */
export function isJpVocabWordHistNeverQuizzed(
  word: Pick<JpVocabWord, "cnt_very" | "cnt_normal" | "cnt_weak">
): boolean {
  return (
    (word.cnt_very ?? 0) + (word.cnt_normal ?? 0) + (word.cnt_weak ?? 0) === 0
  );
}

/**
 * 今日新入库且从未抽查（新课「已完成」同步 / 手动添加当天）：
 * 今天不进抽查池；次日凌晨重排时再从未抽查置顶。
 */
export function isJpVocabWordSameDayNewNeverQuizzed(
  word: Pick<
    JpVocabWord,
    "cnt_very" | "cnt_normal" | "cnt_weak" | "created_at"
  >,
  now = new Date()
): boolean {
  if (!isJpVocabWordHistNeverQuizzed(word)) return false;
  const entered = jpVocabWordEnteredBeijingDate(word.created_at);
  if (!entered) return false;
  return entered >= beijingDateString(now);
}

/**
 * 可进凌晨「从未抽查置顶」：从未抽查且入库日早于今日（不含今天刚同步的）。
 * created_at 缺失的旧数据视为可置顶。
 */
export function isJpVocabWordEligibleNeverQuizzedForFront(
  word: Pick<
    JpVocabWord,
    "cnt_very" | "cnt_normal" | "cnt_weak" | "created_at"
  >,
  now = new Date()
): boolean {
  if (!isJpVocabWordHistNeverQuizzed(word)) return false;
  const entered = jpVocabWordEnteredBeijingDate(word.created_at);
  if (!entered) return true;
  return entered < beijingDateString(now);
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

/** 今日是否已在日语抽问页完成抽查（勾选熟悉程度） */
export function isJpVocabWordQuizzedToday(
  word: Pick<JpVocabWord, "today_check_count" | "today_check_date">,
  now = new Date()
): boolean {
  return (
    effectiveTodayCheckCount(
      word.today_check_count ?? 0,
      word.today_check_date,
      now
    ) > 0
  );
}

/** 全表今日抽查汇总（北京时间 0 点归零） */
export function jpVocabTodayCheckStats(
  words: JpVocabWord[],
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
