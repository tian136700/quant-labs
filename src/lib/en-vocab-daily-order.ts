import { beijingDateString } from "@/lib/en-vocab-daily-check";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  sortEnVocabWordsForDailyOrder,
  type EnVocabStatSortKey,
} from "@/lib/en-vocab-shared";
import type { EnVocabWord } from "@/lib/types";

/**
 * 日序算法版本：与日语「从未抽查置顶 + final_score」对齐。
 * 升级后 ensure 会强制重算当日顺序与老师可见池（勿只 merge 旧序）。
 */
export const EN_VOCAB_DAILY_ORDER_ALGO = "jp_priority_v1";

export type EnVocabDailyDisplayOrder = {
  /** 北京时间 YYYY-MM-DD，当日有效 */
  date: string;
  ids: number[];
  /** 当前排序轮次内已抽查（序号列勾）；今日重置或跨日重排时清空 */
  round_checked_ids?: number[];
  /** 日序算法标记；缺省或非当前版本 → 全量重排 */
  order_algo?: string;
};

export function normalizeEnVocabRoundCheckedIds(
  ids: unknown
): number[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => Number(id)).filter((id) => id > 0);
}

export function isEnVocabRoundChecked(
  order: EnVocabDailyDisplayOrder,
  wordId: number
): boolean {
  return (order.round_checked_ids ?? []).includes(wordId);
}

export function markEnVocabRoundChecked(
  order: EnVocabDailyDisplayOrder,
  wordId: number
): EnVocabDailyDisplayOrder {
  const checked = order.round_checked_ids ?? [];
  if (checked.includes(wordId)) return order;
  return { ...order, round_checked_ids: [...checked, wordId] };
}

export function clearEnVocabRoundChecked(
  order: EnVocabDailyDisplayOrder
): EnVocabDailyDisplayOrder {
  if (!order.round_checked_ids?.length) {
    return { ...order, round_checked_ids: [] };
  }
  return { ...order, round_checked_ids: [] };
}

export function computeEnVocabDailyDisplayOrder(
  words: EnVocabWord[],
  now = new Date()
): number[] {
  return sortEnVocabWordsForDailyOrder(words, now).map((w) => w.id);
}

/** 保留当日已有顺序，新词条追加到末尾，已删词条去掉 */
export function mergeEnVocabDailyDisplayOrder(
  storedIds: number[],
  words: EnVocabWord[]
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

export function appendEnVocabDailyDisplayOrderId(
  order: EnVocabDailyDisplayOrder,
  wordId: number,
  now = new Date()
): EnVocabDailyDisplayOrder {
  const today = beijingDateString(now);
  if (order.date !== today || order.ids.includes(wordId)) return order;
  return {
    date: today,
    ids: [...order.ids, wordId],
    round_checked_ids: order.round_checked_ids,
    order_algo: order.order_algo ?? EN_VOCAB_DAILY_ORDER_ALGO,
  };
}

export function isEnVocabDefaultStatSort(statSort: {
  key: EnVocabStatSortKey;
  dir: "asc" | "desc";
}): boolean {
  return (
    statSort.key === JP_VOCAB_DEFAULT_STAT_SORT.key &&
    statSort.dir === JP_VOCAB_DEFAULT_STAT_SORT.dir
  );
}

/** 当日固定序号（1-based）；仅 reset / 跨日重排时变化，列头排序不影响 */
export function buildEnVocabDailySeqMap(ids: number[]): Map<number, number> {
  const map = new Map<number, number>();
  ids.forEach((id, index) => map.set(id, index + 1));
  return map;
}

export function enVocabDailyOrderAlgoCurrent(
  order: Pick<EnVocabDailyDisplayOrder, "order_algo"> | null | undefined
): boolean {
  return (order?.order_algo || "") === EN_VOCAB_DAILY_ORDER_ALGO;
}
