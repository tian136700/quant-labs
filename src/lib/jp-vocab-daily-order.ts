import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  sortJpVocabWordsForDisplay,
  type JpVocabStatSortKey,
} from "@/lib/jp-vocab-shared";
import type { JpVocabWord } from "@/lib/types";

export type JpVocabDailyDisplayOrder = {
  /** 北京时间 YYYY-MM-DD，当日有效 */
  date: string;
  ids: number[];
};

export function computeJpVocabDailyDisplayOrder(words: JpVocabWord[]): number[] {
  return sortJpVocabWordsForDisplay(words, JP_VOCAB_DEFAULT_STAT_SORT).map(
    (w) => w.id
  );
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
