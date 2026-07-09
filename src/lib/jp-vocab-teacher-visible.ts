import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { buildJpVocabDailySeqMap } from "@/lib/jp-vocab-daily-order";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabWord } from "@/lib/types";

/** 非管理员老师默认仅可见当日序号 1–20 */
export const JP_VOCAB_TEACHER_VISIBLE_DEFAULT = 20;

/** 管理员释放条数输入框默认值 */
export const JP_VOCAB_TEACHER_VISIBLE_STEP = 20;

export type JpVocabTeacherVisibleLimit = {
  /** 北京时间 YYYY-MM-DD，跨日自动回到默认 20 */
  date: string;
  /** 当日已开放到的最大序号（累计终点） */
  limit: number;
  /** 当前老师可见的条数（本批窗口大小） */
  count: number;
};

function normalizeVisibleCount(
  rawCount: unknown,
  limit: number
): number {
  const parsed = Number(rawCount);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.min(Math.floor(parsed), Math.max(1, limit));
  }
  return Math.min(limit, JP_VOCAB_TEACHER_VISIBLE_DEFAULT);
}

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
    return { date: today, limit, count: normalizeVisibleCount(raw?.count, limit) };
  }
  return {
    date: today,
    limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  };
}

export function jpVocabTeacherVisibleRange(
  visible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count">
): { start: number; end: number } {
  const end = Math.max(0, Math.floor(visible.limit));
  const count = normalizeVisibleCount(visible.count, end);
  const start = Math.max(1, end - count + 1);
  return { start, end };
}

export function filterJpVocabWordsByTeacherVisibleLimit(
  words: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder,
  visible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count">
): JpVocabWord[] {
  if (visible.limit <= 0 || !words.length) return [];
  const seqMap = buildJpVocabDailySeqMap(displayOrder.ids);
  const { start, end } = jpVocabTeacherVisibleRange(visible);
  return words.filter((word) => {
    const seq = seqMap.get(word.id) ?? Infinity;
    return seq >= start && seq <= end;
  });
}

export function jpVocabTeacherVisibleRangeLabel(
  visible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count">
): string {
  const { start, end } = jpVocabTeacherVisibleRange(visible);
  return `${start}–${end}`;
}

export function parseJpVocabTeacherVisibleReleaseCount(
  raw: unknown
): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(Math.floor(parsed), 999);
}
