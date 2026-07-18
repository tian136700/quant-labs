import {
  beijingDateString,
  effectiveTodayCheckCount,
} from "@/lib/jp-vocab-daily-check";
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

/** 序号列勾选：优先用已存 round_checked_ids，否则按今日抽查次数回填（与老师页一致） */
export function resolveJpVocabRoundCheckedIds(
  stored: unknown,
  words: JpVocabWord[],
  now = new Date()
): number[] {
  const fromStored = normalizeJpVocabRoundCheckedIds(stored);
  if (fromStored.length > 0) return fromStored;
  return words
    .filter(
      (w) =>
        effectiveTodayCheckCount(
          w.today_check_count ?? 0,
          w.today_check_date,
          now
        ) > 0
    )
    .map((w) => w.id);
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

/** 与 teacher-visible 一致：历史熟悉程度次数合计为 0 即从未抽查 */
function isJpVocabWordNeverQuizzedForOrder(word: JpVocabWord): boolean {
  return (
    (word.cnt_very ?? 0) + (word.cnt_normal ?? 0) + (word.cnt_weak ?? 0) === 0
  );
}

/**
 * 保留当日已有顺序，已删词条去掉。
 * 新词：从未抽查的插到最前（与凌晨重排「从未抽查置顶」一致），其余仍追加末尾。
 * 禁止把从未抽查新词只 append 到末尾——否则今日池按「从未抽查优先」会抽到序号 200+，
 * 管理员端看起来像「设了 75 却只勾到 62」。
 */
export function mergeJpVocabDailyDisplayOrder(
  storedIds: number[],
  words: JpVocabWord[]
): number[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  const merged: number[] = [];
  const seen = new Set<number>();
  for (const id of storedIds) {
    if (byId.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  }
  const newNever: number[] = [];
  const newOther: number[] = [];
  for (const w of words) {
    if (seen.has(w.id)) continue;
    if (isJpVocabWordNeverQuizzedForOrder(w)) newNever.push(w.id);
    else newOther.push(w.id);
  }
  return [...newNever, ...merged, ...newOther];
}

/**
 * 当日顺序追加新词 id。新词首次入库必为从未抽查 → 插到最前，勿 append 末尾。
 * date 非今日时原样返回（跨日应由 ensure/refresh 全量重排，勿写成只含新词的残缺顺序）。
 */
export function appendJpVocabDailyDisplayOrderId(
  order: JpVocabDailyDisplayOrder,
  wordId: number,
  now = new Date()
): JpVocabDailyDisplayOrder {
  const today = beijingDateString(now);
  if (order.date !== today || order.ids.includes(wordId)) return order;
  return {
    date: today,
    ids: [wordId, ...order.ids],
    round_checked_ids: order.round_checked_ids,
  };
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
