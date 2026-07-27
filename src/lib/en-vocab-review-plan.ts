import { buildEnVocabDailySeqMap } from "@/lib/en-vocab-daily-order";
import { EN_VOCAB_DAILY_QUIZ_TOP } from "@/lib/en-vocab-page-constants";
import { sortEnVocabWordsByStat } from "@/lib/en-vocab-shared";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import type { EnVocabWord } from "@/lib/types";

export type EnVocabReviewSortMode = "seq" | "risk";

/** 与英语抽背「今日抽查数量」默认值一致 */
export const EN_VOCAB_REVIEW_DEFAULT_COUNT = EN_VOCAB_DAILY_QUIZ_TOP;

export function normalizeEnVocabReviewCount(
  raw: unknown,
  maxCount: number
): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return EN_VOCAB_REVIEW_DEFAULT_COUNT;
  return Math.min(Math.max(1, n), Math.max(1, maxCount));
}

export function normalizeEnVocabReviewSortMode(raw: unknown): EnVocabReviewSortMode {
  return raw === "risk" ? "risk" : "seq";
}

/** 按复习计划截取词条列表（序号 1–N 或抽查优先级降序前 N） */
export function buildEnVocabReviewWordList(
  words: EnVocabWord[],
  displayOrder: EnVocabDailyDisplayOrder,
  options: { count: number; sortMode: EnVocabReviewSortMode }
): EnVocabWord[] {
  if (!words.length) return [];
  const count = normalizeEnVocabReviewCount(options.count, words.length);
  const byId = new Map(words.map((w) => [w.id, w]));

  if (options.sortMode === "seq") {
    const orderedIds = displayOrder.ids.length
      ? displayOrder.ids.filter((id) => byId.has(id))
      : words.map((w) => w.id);
    return orderedIds
      .slice(0, count)
      .map((id) => byId.get(id)!)
      .filter(Boolean);
  }

  const sorted = sortEnVocabWordsByStat(words, "risk", "desc");
  return sorted.slice(0, count);
}

export function buildEnVocabReviewDailySeqMap(
  reviewWords: EnVocabWord[],
  displayOrder: EnVocabDailyDisplayOrder,
  sortMode: EnVocabReviewSortMode
): Map<number, number> {
  if (sortMode === "seq") {
    return buildEnVocabDailySeqMap(displayOrder.ids);
  }
  const map = new Map<number, number>();
  reviewWords.forEach((w, index) => map.set(w.id, index + 1));
  return map;
}
