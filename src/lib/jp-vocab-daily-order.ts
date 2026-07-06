import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  sortJpVocabWordsForDailyOrder,
  type JpVocabStatSortKey,
} from "@/lib/jp-vocab-shared";
import type { JpVocabWord } from "@/lib/types";

export type JpVocabDailyDisplayOrder = {
  /** 北京时间 YYYY-MM-DD，当日有效 */
  date: string;
  ids: number[];
  /** 当前排序轮次内已抽查（序号列勾）；今日重置或跨日重排时清空 */
  round_checked_ids?: number[];
};

export function normalizeJpVocabRoundCheckedIds(
  ids: unknown
): number[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => Number(id)).filter((id) => id > 0);
}

export function isJpVocabRoundChecked(
  order: JpVocabDailyDisplayOrder,
  wordId: number
): boolean {
  return (order.round_checked_ids ?? []).includes(wordId);
}

export function markJpVocabRoundChecked(
  order: JpVocabDailyDisplayOrder,
  wordId: number
): JpVocabDailyDisplayOrder {
  const checked = order.round_checked_ids ?? [];
  if (checked.includes(wordId)) return order;
  return { ...order, round_checked_ids: [...checked, wordId] };
}

export function unmarkJpVocabRoundChecked(
  order: JpVocabDailyDisplayOrder,
  wordId: number
): JpVocabDailyDisplayOrder {
  const checked = order.round_checked_ids ?? [];
  if (!checked.includes(wordId)) return order;
  return {
    ...order,
    round_checked_ids: checked.filter((id) => id !== wordId),
  };
}

export function clearJpVocabRoundChecked(
  order: JpVocabDailyDisplayOrder
): JpVocabDailyDisplayOrder {
  if (!order.round_checked_ids?.length) {
    return { ...order, round_checked_ids: [] };
  }
  return { ...order, round_checked_ids: [] };
}

export function computeJpVocabDailyDisplayOrder(words: JpVocabWord[]): number[] {
  return sortJpVocabWordsForDailyOrder(words).map((w) => w.id);
}

/** 保留当日已有顺序，新词条追加到末尾，已删词条去掉 */
export function mergeJpVocabDailyDisplayOrder(
  storedIds: number[],
  words: JpVocabWord[]
): number[] {
  const byId = new Set(words.map((w) => w.id));
  const merged: number[] = [];
  const seen = new Set<number>();
  for (const id of storedIds) {
    if (byId.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  }
  for (const w of words) {
    if (!seen.has(w.id)) merged.push(w.id);
  }
  return merged;
}

export function appendJpVocabDailyDisplayOrderId(
  order: JpVocabDailyDisplayOrder,
  wordId: number,
  now = new Date()
): JpVocabDailyDisplayOrder {
  const today = beijingDateString(now);
  if (order.date !== today || order.ids.includes(wordId)) return order;
  return { date: today, ids: [...order.ids, wordId] };
}

export function isJpVocabDefaultStatSort(statSort: {
  key: JpVocabStatSortKey;
  dir: "asc" | "desc";
}): boolean {
  return (
    statSort.key === JP_VOCAB_DEFAULT_STAT_SORT.key &&
    statSort.dir === JP_VOCAB_DEFAULT_STAT_SORT.dir
  );
}

/** 当日固定序号（1-based）；仅 reset / 跨日重排时变化，列头排序不影响 */
export function buildJpVocabDailySeqMap(ids: number[]): Map<number, number> {
  const map = new Map<number, number>();
  ids.forEach((id, index) => map.set(id, index + 1));
  return map;
}
