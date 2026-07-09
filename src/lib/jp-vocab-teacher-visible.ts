import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { buildJpVocabDailySeqMap } from "@/lib/jp-vocab-daily-order";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabWord } from "@/lib/types";

/** 非管理员老师默认仅可见当日序号 1–20 */
export const JP_VOCAB_TEACHER_VISIBLE_DEFAULT = 20;

/** 管理员每次为老师多开放 20 条 */
export const JP_VOCAB_TEACHER_VISIBLE_STEP = 20;

export type JpVocabTeacherVisibleLimit = {
  /** 北京时间 YYYY-MM-DD，跨日自动回到默认 20 */
  date: string;
  limit: number;
};

export function normalizeJpVocabTeacherVisibleLimit(
  raw: Partial<JpVocabTeacherVisibleLimit> | null | undefined,
  now = new Date()
): JpVocabTeacherVisibleLimit {
  const today = beijingDateString(now);
  const parsedLimit = Number(raw?.limit);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit >= JP_VOCAB_TEACHER_VISIBLE_DEFAULT
      ? Math.floor(parsedLimit)
      : JP_VOCAB_TEACHER_VISIBLE_DEFAULT;
  if (raw?.date === today) {
    return { date: today, limit };
  }
  return { date: today, limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT };
}

export function filterJpVocabWordsByTeacherVisibleLimit(
  words: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder,
  limit: number
): JpVocabWord[] {
  if (limit <= 0 || !words.length) return [];
  const seqMap = buildJpVocabDailySeqMap(displayOrder.ids);
  const end = Math.max(0, Math.floor(limit));
  const start = Math.max(1, end - JP_VOCAB_TEACHER_VISIBLE_STEP + 1);
  return words.filter((word) => {
    const seq = seqMap.get(word.id) ?? Infinity;
    return seq >= start && seq <= end;
  });
}

export function jpVocabTeacherVisibleRangeLabel(limit: number): string {
  const end = Math.max(0, Math.floor(limit));
  const start = Math.max(1, end - JP_VOCAB_TEACHER_VISIBLE_STEP + 1);
  return `${start}–${end}`;
}
