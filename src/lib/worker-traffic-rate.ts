import { beijingDateString, beijingHour } from "@/lib/jp-vocab-daily-check";

/** Cloudflare 日配额约 UTC 0 重置 ≈ 北京 08:00 */
export const WORKER_QUOTA_RESET_BEIJING_HOUR = 8;

/** 配额日内小时顺序：北京 08→23→次日 00→07（与 CF 日请求窗口一致） */
export const WORKER_QUOTA_HOUR_ORDER: readonly number[] = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5,
  6, 7,
];

/**
 * 当前配额日 YYYY-MM-DD：窗口 = 该日北京 08:00 → 次日北京 08:00。
 * 北京 00:00–07:59 仍属「昨天」配额日（勿用日历日 beijingDateString）。
 */
export function workerQuotaDateString(now = new Date()): string {
  const date = beijingDateString(now);
  const hour = beijingHour(now);
  if (hour >= WORKER_QUOTA_RESET_BEIJING_HOUR) return date;
  const todayResetMs = new Date(`${date}T08:00:00+08:00`).getTime();
  if (!Number.isFinite(todayResetMs)) return date;
  return beijingDateString(new Date(todayResetMs - 24 * 60 * 60 * 1000));
}

/**
 * 距最近一次北京 08:00（配额重置）的秒数，至少 1。
 * 用于看板「平均每秒请求」。
 */
export function beijingSecondsSinceQuotaReset(now = new Date()): number {
  const date = beijingDateString(now);
  const hour = beijingHour(now);
  const todayReset = new Date(`${date}T08:00:00+08:00`).getTime();
  let resetMs = todayReset;
  if (hour < WORKER_QUOTA_RESET_BEIJING_HOUR) {
    resetMs = todayReset - 24 * 60 * 60 * 1000;
  }
  if (!Number.isFinite(resetMs)) return 1;
  return Math.max(1, Math.floor((now.getTime() - resetMs) / 1000));
}

/**
 * 某配额日用于算平均的已过秒数：当前日用实时；过去完整日用 86400。
 */
export function beijingSecondsInQuotaWindow(
  statDate: string,
  now = new Date()
): number {
  const date = (statDate || "").trim() || workerQuotaDateString(now);
  const current = workerQuotaDateString(now);
  if (date === current) return beijingSecondsSinceQuotaReset(now);
  if (date < current) return 24 * 60 * 60;
  return 1;
}

export function avgHitsPerSecond(totalHits: number, elapsedSec: number): number {
  const hits = Math.max(0, Number(totalHits) || 0);
  const sec = Math.max(1, Number(elapsedSec) || 1);
  return Math.round((hits / sec) * 1000) / 1000;
}

export function peakHourHitsPerSecond(peakHourHits: number): number {
  const hits = Math.max(0, Number(peakHourHits) || 0);
  return Math.round((hits / 3600) * 1000) / 1000;
}
