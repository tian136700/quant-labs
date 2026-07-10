import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { runJpVocabDailyRolloverInDb } from "@/lib/jp-vocab-db";

export type JpVocabDailyRolloverResult = {
  date: string;
  dry_run: boolean;
  teacher_visible_reset: boolean;
  display_order_refreshed: boolean;
  deleted_shared: number;
  deleted_share_requests: number;
  cleared_today_checks: number;
};

/** 北京时间跨日清理：仅当日临时状态，不触碰词条主表与历史复习统计。 */
export async function runJpVocabDailyRollover(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<JpVocabDailyRolloverResult> {
  return runJpVocabDailyRolloverInDb(db, options);
}

export function jpVocabDailyRolloverDate(now = new Date()): string {
  return beijingDateString(now);
}
