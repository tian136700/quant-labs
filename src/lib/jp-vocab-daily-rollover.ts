import "server-only";

import {
  countJpVocabCoachCoachedOlderThanRetention,
  pruneJpVocabCoachCoachedOlderThanRetention,
} from "@/lib/jp-vocab-coach-db";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  runJpVocabDailyRolloverInDb,
  type JpVocabDailyRolloverResult,
} from "@/lib/jp-vocab-db";

export type JpVocabDailyRolloverWithCoachResult = JpVocabDailyRolloverResult & {
  /** 课堂带读：清空前一日及更早的已带读条数（未带读保留） */
  cleared_coach_coached: number;
};

export type { JpVocabDailyRolloverResult };

/**
 * 北京时间跨日清理：当日临时状态 + 课堂带读「已带读」。
 * 不触碰词条主表与历史复习统计；未带读队列保留。
 */
export async function runJpVocabDailyRollover(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<JpVocabDailyRolloverWithCoachResult> {
  const result = await runJpVocabDailyRolloverInDb(db, options);
  const now = options.now ?? new Date();
  const cleared_coach_coached = options.dryRun
    ? await countJpVocabCoachCoachedOlderThanRetention(db, now)
    : await pruneJpVocabCoachCoachedOlderThanRetention(db, now);
  return { ...result, cleared_coach_coached };
}

export function jpVocabDailyRolloverDate(now = new Date()): string {
  return beijingDateString(now);
}
