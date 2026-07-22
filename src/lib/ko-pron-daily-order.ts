import {
  beijingDateString,
  isJpVocabWordEligibleNeverQuizzedForFront,
  isJpVocabWordHistNeverQuizzed,
  isJpVocabWordSameDayNewNeverQuizzed,
} from "@/lib/jp-vocab-daily-check";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  jpVocabFinalQuizScore,
  normalizeJpVocabQuizTimeWeight,
} from "@/lib/jp-vocab-quiz-score";
import type { KoPronLetter } from "@/lib/types";

/**
 * 韩语字母日序：与 `sortJpVocabWordsForDailyOrder` **同一套算法**
 *（从未抽查置顶 → final_score 降序 → 今日新建沉底）。
 * 得分公式直接复用 jp-vocab-quiz-score（priority + days × timeWeight）。
 */
export function sortKoPronLettersForDailyOrder(
  letters: KoPronLetter[],
  now = new Date(),
  timeWeight: number = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
): KoPronLetter[] {
  const weight = normalizeJpVocabQuizTimeWeight(timeWeight);
  return [...letters].sort((a, b) => {
    const aDefer = isJpVocabWordSameDayNewNeverQuizzed(a, now);
    const bDefer = isJpVocabWordSameDayNewNeverQuizzed(b, now);
    if (aDefer !== bDefer) return aDefer ? 1 : -1;

    const aFront = isJpVocabWordEligibleNeverQuizzedForFront(a, now);
    const bFront = isJpVocabWordEligibleNeverQuizzedForFront(b, now);
    if (aFront !== bFront) return aFront ? -1 : 1;

    // 从未抽查桶内：不算 final_score，按字母字形稳定排序
    if (aFront || bFront || aDefer || bDefer) {
      return a.letter.localeCompare(b.letter, "ko");
    }

    const diff =
      jpVocabFinalQuizScore(b, weight, now) -
      jpVocabFinalQuizScore(a, weight, now);
    if (diff !== 0) return diff;
    return a.letter.localeCompare(b.letter, "ko");
  });
}

export type KoPronDailyDisplayOrder = {
  /** 北京时间 YYYY-MM-DD */
  date: string;
  ids: number[];
};

export function computeKoPronDailyDisplayOrder(
  letters: KoPronLetter[],
  now = new Date(),
  timeWeight?: number
): number[] {
  return sortKoPronLettersForDailyOrder(letters, now, timeWeight).map(
    (l) => l.id
  );
}

/** 当日已有顺序则沿用；新字母追加末尾；已删去掉 */
export function mergeKoPronDailyDisplayOrder(
  storedIds: number[],
  letters: KoPronLetter[]
): number[] {
  const byId = new Set(letters.map((l) => l.id));
  const merged: number[] = [];
  const seen = new Set<number>();
  for (const id of storedIds) {
    if (byId.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  }
  for (const letter of letters) {
    if (!seen.has(letter.id)) merged.push(letter.id);
  }
  return merged;
}

export function normalizeKoPronDailyDisplayOrder(
  raw: unknown,
  now = new Date()
): KoPronDailyDisplayOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const date =
    typeof obj.date === "string" && obj.date
      ? obj.date
      : beijingDateString(now);
  const ids = Array.isArray(obj.ids)
    ? obj.ids.map((id) => Number(id)).filter((id) => id > 0)
    : [];
  if (!ids.length) return null;
  return { date, ids };
}

/** 按日序 ids 建「今日序号」；无序时回退为按算法现算 */
export function buildKoPronDailySeqMap(
  letters: KoPronLetter[],
  orderIds?: number[] | null,
  now = new Date()
): Map<number, number> {
  const ids =
    orderIds?.length && orderIds.length > 0
      ? orderIds
      : computeKoPronDailyDisplayOrder(letters, now);
  const map = new Map<number, number>();
  ids.forEach((id, i) => map.set(id, i + 1));
  return map;
}

/** 字母是否从未抽查（与日语 isJpVocabWordHistNeverQuizzed 同判定） */
export function isKoPronLetterHistNeverQuizzed(
  letter: Pick<KoPronLetter, "cnt_very" | "cnt_normal" | "cnt_weak">
): boolean {
  return isJpVocabWordHistNeverQuizzed(letter);
}

/** 抽查优先级原始分（与 jpVocabRiskIndex 同公式） */
export function koPronRiskIndex(
  letter: Pick<KoPronLetter, "cnt_very" | "cnt_normal" | "cnt_weak">
): number {
  const raw =
    letter.cnt_normal * 1 + letter.cnt_weak * 2 - letter.cnt_very * 0.3;
  return Math.round(raw * 10) / 10;
}

/** 最终抽问得分；从未抽查 → null */
export function koPronFinalQuizScoreOrNull(
  letter: Pick<
    KoPronLetter,
    "cnt_very" | "cnt_normal" | "cnt_weak" | "last_review_at" | "created_at"
  >,
  timeWeight: number = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  now = new Date()
): number | null {
  if (isKoPronLetterHistNeverQuizzed(letter)) return null;
  return jpVocabFinalQuizScore(letter, timeWeight, now);
}
