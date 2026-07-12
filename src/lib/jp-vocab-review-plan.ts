import { buildJpVocabDailySeqMap } from "@/lib/jp-vocab-daily-order";
import { JP_VOCAB_DAILY_QUIZ_TOP } from "@/lib/jp-vocab-daily-quiz-progress";
import { sortJpVocabWordsByStat } from "@/lib/jp-vocab-shared";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabWord } from "@/lib/types";

export type JpVocabReviewSortMode = "seq" | "risk";

/** 与日语抽问「今日抽查数量」默认值一致 */
export const JP_VOCAB_REVIEW_DEFAULT_COUNT = JP_VOCAB_DAILY_QUIZ_TOP;

export function normalizeJpVocabReviewCount(
  raw: unknown,
  maxCount: number
): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return JP_VOCAB_REVIEW_DEFAULT_COUNT;
  return Math.min(Math.max(1, n), Math.max(1, maxCount));
}

export function normalizeJpVocabReviewSortMode(raw: unknown): JpVocabReviewSortMode {
  return raw === "risk" ? "risk" : "seq";
}

/** 按复习计划截取词条列表（序号 1–N 或抽查优先级降序前 N） */
export function buildJpVocabReviewWordList(
  words: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder,
  options: { count: number; sortMode: JpVocabReviewSortMode }
): JpVocabWord[] {
  if (!words.length) return [];
  const count = normalizeJpVocabReviewCount(options.count, words.length);
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

  const sorted = sortJpVocabWordsByStat(words, "risk", "desc");
  return sorted.slice(0, count);
}

export function buildJpVocabReviewDailySeqMap(
  reviewWords: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder,
  sortMode: JpVocabReviewSortMode
): Map<number, number> {
  if (sortMode === "seq") {
    return buildJpVocabDailySeqMap(displayOrder.ids);
  }
  const map = new Map<number, number>();
  reviewWords.forEach((w, index) => map.set(w.id, index + 1));
  return map;
}
