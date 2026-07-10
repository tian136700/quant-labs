import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  runJpVocabDailyRolloverInDb,
  type JpVocabDailyRolloverResult,
} from "@/lib/jp-vocab-db";

export type { JpVocabDailyRolloverResult };

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
