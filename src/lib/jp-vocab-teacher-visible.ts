import { beijingDateString, effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import {
  buildJpVocabDailySeqMap,
  isJpVocabRoundChecked,
} from "@/lib/jp-vocab-daily-order";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { JP_VOCAB_DAILY_QUIZ_TOP } from "@/lib/jp-vocab-daily-quiz-progress";
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
  /** 管理员设置的当日抽查目标数量 */
  quiz_target: number;
};

function normalizeQuizTarget(raw: unknown): number {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.min(Math.floor(parsed), 999);
  }
  return JP_VOCAB_DAILY_QUIZ_TOP;
}

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
  const quiz_target = normalizeQuizTarget(raw?.quiz_target);
  if (raw?.date === today) {
    return {
      date: today,
      limit,
      count: normalizeVisibleCount(raw?.count, limit),
      quiz_target,
    };
  }
  return {
    date: today,
    limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    quiz_target,
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

/** 今日是否已抽查（含今日抽查次数与本轮序号勾选） */
export function isJpVocabWordQuizCheckedToday(
  word: JpVocabWord,
  displayOrder?: JpVocabDailyDisplayOrder,
  now = new Date()
): boolean {
  if (
    effectiveTodayCheckCount(
      word.today_check_count ?? 0,
      word.today_check_date,
      now
    ) > 0
  ) {
    return true;
  }
  const today = beijingDateString(now);
  return (
    displayOrder?.date === today &&
    isJpVocabRoundChecked(displayOrder, word.id)
  );
}

export type JpVocabTeacherVisibleReleasePlan = {
  limit: number;
  count: number;
  start: number;
  end: number;
};

/**
 * 计算释放下一批老师可见词条：从当前终点往后跳过今日已抽查的序号，
 * 再连续取 releaseCount 条（避免管理员在全表预勾后，老师仍看到旧词）。
 */
export function planJpVocabTeacherVisibleRelease(
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  current: Pick<JpVocabTeacherVisibleLimit, "limit" | "count">,
  releaseCount: number,
  now = new Date()
): JpVocabTeacherVisibleReleasePlan | null {
  const totalSeq = displayOrder.ids.length;
  const currentEnd = Math.max(0, Math.floor(current.limit));
  if (currentEnd >= totalSeq) return null;

  const count = Math.max(1, Math.floor(releaseCount));
  const wordById = new Map(words.map((w) => [w.id, w]));
  const isChecked = (wordId: number) => {
    const word = wordById.get(wordId);
    return word
      ? isJpVocabWordQuizCheckedToday(word, displayOrder, now)
      : false;
  };

  let seq = currentEnd + 1;
  while (seq <= totalSeq && isChecked(displayOrder.ids[seq - 1])) {
    seq++;
  }

  let released = 0;
  let lastSeq = currentEnd;
  for (; seq <= totalSeq && released < count; seq++) {
    const wordId = displayOrder.ids[seq - 1];
    if (isChecked(wordId)) continue;
    released++;
    lastSeq = seq;
  }

  if (released === 0) {
    const limit = Math.min(totalSeq, currentEnd + count);
    const { start, end } = jpVocabTeacherVisibleRange({ limit, count });
    return { limit, count, start, end };
  }

  const limit = lastSeq;
  const { start, end } = jpVocabTeacherVisibleRange({ limit, count });
  return { limit, count, start, end };
}
