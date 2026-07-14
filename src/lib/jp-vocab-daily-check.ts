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
