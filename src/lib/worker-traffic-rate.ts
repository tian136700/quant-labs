import { beijingDateString, beijingHour } from "@/lib/jp-vocab-daily-check";

/** Cloudflare 日配额约 UTC 0 重置 ≈ 北京 08:00 */
export const WORKER_QUOTA_RESET_BEIJING_HOUR = 8;

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

export function avgHitsPerSecond(totalHits: number, elapsedSec: number): number {
  const hits = Math.max(0, Number(totalHits) || 0);
  const sec = Math.max(1, Number(elapsedSec) || 1);
  return Math.round((hits / sec) * 1000) / 1000;
}

export function peakHourHitsPerSecond(peakHourHits: number): number {
  const hits = Math.max(0, Number(peakHourHits) || 0);
  return Math.round((hits / 3600) * 1000) / 1000;
}
