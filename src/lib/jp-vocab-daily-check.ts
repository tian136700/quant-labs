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
