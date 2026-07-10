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
  /** 当日已扫描到的最大序号（释放游标） */
  limit: number;
  /** 当前老师可见的条数（本批窗口大小） */
  count: number;
  /** 管理员设置的当日抽查目标数量 */
  quiz_target: number;
  /** 释放后老师可见的词条 id（精确列表，排除今日已抽查） */
  visible_ids?: number[];
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

function normalizeVisibleIds(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.map((id) => Number(id)).filter((id) => id > 0);
  return ids.length ? ids : undefined;
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
      visible_ids: normalizeVisibleIds(raw?.visible_ids),
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

/** 从游标往后按序号取 N 个今日尚未抽查的词条 id */
export function pickJpVocabTeacherVisibleReleaseIds(
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  cursorLimit: number,
  releaseCount: number,
  now = new Date()
): number[] {
  const totalSeq = displayOrder.ids.length;
  const cursor = Math.max(0, Math.floor(cursorLimit));
  const target = Math.max(1, Math.floor(releaseCount));
  const wordById = new Map(words.map((w) => [w.id, w]));
  const picked: number[] = [];

  for (let seq = cursor + 1; seq <= totalSeq && picked.length < target; seq++) {
    const wordId = displayOrder.ids[seq - 1];
    const word = wordById.get(wordId);
    if (!word) continue;
    if (isJpVocabWordQuizCheckedToday(word, displayOrder, now)) continue;
    picked.push(wordId);
  }

  return picked;
}

export function filterJpVocabWordsByTeacherVisibleLimit(
  words: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder,
  visible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count" | "visible_ids">
): JpVocabWord[] {
  if (!words.length) return [];

  if (visible.visible_ids?.length) {
    const idSet = new Set(visible.visible_ids);
    const orderIndex = new Map(displayOrder.ids.map((id, index) => [id, index]));
    return words
      .filter((word) => idSet.has(word.id))
      .sort(
        (a, b) =>
          (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  }

  if (visible.limit <= 0) return [];
  const seqMap = buildJpVocabDailySeqMap(displayOrder.ids);
  const { start, end } = jpVocabTeacherVisibleRange(visible);
  return words.filter((word) => {
    const seq = seqMap.get(word.id) ?? Infinity;
    return seq >= start && seq <= end;
  });
}

export function jpVocabTeacherVisibleRangeLabel(
  visible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count" | "visible_ids">,
  displayOrder?: JpVocabDailyDisplayOrder
): string {
  if (visible.visible_ids?.length && displayOrder?.ids.length) {
    const seqMap = buildJpVocabDailySeqMap(displayOrder.ids);
    const seqs = visible.visible_ids
      .map((id) => seqMap.get(id) ?? 0)
      .filter((seq) => seq > 0);
    if (seqs.length) {
      return `${Math.min(...seqs)}–${Math.max(...seqs)}`;
    }
  }
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

export type JpVocabTeacherVisibleReleasePlan = {
  limit: number;
  count: number;
  visible_ids: number[];
  start: number;
  end: number;
};

/**
 * 计算释放下一批老师可见词条：从当前游标往后按当日序号扫描，
 * 跳过今日已抽查的词条，精确选取 releaseCount 个未抽查词。
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

  const visible_ids = pickJpVocabTeacherVisibleReleaseIds(
    displayOrder,
    words,
    currentEnd,
    releaseCount,
    now
  );
  if (!visible_ids.length) return null;

  const seqMap = buildJpVocabDailySeqMap(displayOrder.ids);
  const seqs = visible_ids
    .map((id) => seqMap.get(id) ?? 0)
    .filter((seq) => seq > 0);
  if (!seqs.length) return null;

  const limit = Math.max(...seqs);
  const start = Math.min(...seqs);
  return {
    limit,
    count: visible_ids.length,
    visible_ids,
    start,
    end: limit,
  };
}

/** 修复旧版仅按连续序号释放、未写入 visible_ids 的批次 */
export function repairJpVocabTeacherVisibleIds(
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  visible: JpVocabTeacherVisibleLimit,
  now = new Date()
): JpVocabTeacherVisibleLimit {
  if (visible.visible_ids?.length) return visible;
  if (visible.count >= visible.limit) return visible;

  const { start, end } = jpVocabTeacherVisibleRange(visible);
  const wordById = new Map(words.map((w) => [w.id, w]));
  const visible_ids: number[] = [];
  for (let seq = start; seq <= end; seq++) {
    const wordId = displayOrder.ids[seq - 1];
    const word = wordById.get(wordId);
    if (!word) continue;
    if (isJpVocabWordQuizCheckedToday(word, displayOrder, now)) continue;
    visible_ids.push(wordId);
  }
  if (!visible_ids.length) return visible;
  return { ...visible, visible_ids, count: visible_ids.length };
}
