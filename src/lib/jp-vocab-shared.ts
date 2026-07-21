import {
  isJpVocabWordEligibleNeverQuizzedForFront,
  isJpVocabWordSameDayNewNeverQuizzed,
} from "@/lib/jp-vocab-daily-check";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  jpVocabFinalQuizScore,
  normalizeJpVocabQuizTimeWeight,
} from "@/lib/jp-vocab-quiz-score";
import type { JpVocabWord } from "@/lib/types";

export type JpVocabStatSortKey = "very" | "normal" | "weak" | "total" | "risk" | "seq";

/** 单词表默认排序：合计为 0 的置顶，其余按抽查优先级降序 */
export const JP_VOCAB_DEFAULT_STAT_SORT: {
  key: JpVocabStatSortKey;
  dir: "asc" | "desc";
} = { key: "risk", dir: "desc" };

export function jpVocabPriorityLabel(locale: "zh" | "en" = "zh"): string {
  return locale === "zh" ? "抽查优先级" : "Check priority";
}

export function jpVocabTotalReviews(word: JpVocabWord): number {
  return word.cnt_very + word.cnt_normal + word.cnt_weak;
}

/** 合计列展示：0 次时显示「未抽查」等短文案，避免裸数字 0 */
export function formatJpVocabTotalReviewsDisplay(
  word: JpVocabWord,
  locale: "zh" | "en" = "zh"
): { label: string; isZero: boolean } {
  const total = jpVocabTotalReviews(word);
  if (total === 0) {
    return {
      label: locale === "zh" ? "从未抽查" : "Never",
      isZero: true,
    };
  }
  return { label: String(total), isZero: false };
}

export function jpVocabTotalReviewsZeroHint(locale: "zh" | "en" = "zh"): string {
  return locale === "zh" ? "从未抽查过" : "Never checked";
}

/** 抽查优先级 = 一般×1 + 不熟悉×2 − 非常熟悉×0.3，保留 1 位小数 */
export function jpVocabRiskIndex(word: JpVocabWord): number {
  const raw = word.cnt_normal * 1 + word.cnt_weak * 2 - word.cnt_very * 0.3;
  return Math.round(raw * 10) / 10;
}

function statSortValue(
  word: JpVocabWord,
  key: JpVocabStatSortKey,
  timeWeight: number,
  now: Date
): number {
  switch (key) {
    case "very":
      return word.cnt_very;
    case "normal":
      return word.cnt_normal;
    case "weak":
      return word.cnt_weak;
    case "total":
      return jpVocabTotalReviews(word);
    case "risk":
      // 列表「抽查优先级」列：用 final_score（含久未复习抬升），与凌晨日序一致
      return jpVocabFinalQuizScore(word, timeWeight, now);
    case "seq":
      return 0;
  }
}

/** 复习优先级：不熟悉次数降序 → 一般次数降序 → 单词名 */
export function sortJpVocabWords(words: JpVocabWord[]): JpVocabWord[] {
  return [...words].sort((a, b) => {
    if (b.cnt_weak !== a.cnt_weak) return b.cnt_weak - a.cnt_weak;
    if (b.cnt_normal !== a.cnt_normal) return b.cnt_normal - a.cnt_normal;
    return a.word.localeCompare(b.word, "ja");
  });
}

/** 按复习次数单列排序（同值按单词名） */
export function sortJpVocabWordsByStat(
  words: JpVocabWord[],
  key: JpVocabStatSortKey,
  dir: "asc" | "desc",
  opts?: { now?: Date; timeWeight?: number }
): JpVocabWord[] {
  const mul = dir === "asc" ? 1 : -1;
  const now = opts?.now ?? new Date();
  const timeWeight = normalizeJpVocabQuizTimeWeight(
    opts?.timeWeight ?? JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
  );
  return [...words].sort((a, b) => {
    const diff =
      statSortValue(a, key, timeWeight, now) -
      statSortValue(b, key, timeWeight, now);
    if (diff !== 0) return diff * mul;
    return a.word.localeCompare(b.word, "ja");
  });
}

/**
 * 每日固定序号（凌晨重排）：
 * 1. 管理员标记的「明日优先」按点击顺序 1、2、3…（仅生效日当天）
 * 2. 可置顶的从未抽查（入库日早于今日）在前
 * 3. 其余按最终抽问得分降序：priority + days_since_last_review × timeWeight
 * 4. 今日刚入库且从未抽查的沉底（今天不抽，明天再置顶）
 *
 * `last_review_at` 即最后一次抽问时间（无需新建 last_review_date 列）。
 */
export function sortJpVocabWordsForDailyOrder(
  words: JpVocabWord[],
  now = new Date(),
  boostSeqByWordId?: Map<number, number>,
  timeWeight: number = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
): JpVocabWord[] {
  const weight = normalizeJpVocabQuizTimeWeight(timeWeight);
  return [...words].sort((a, b) => {
    const aBoost = boostSeqByWordId?.get(a.id);
    const bBoost = boostSeqByWordId?.get(b.id);
    const aHasBoost = aBoost != null;
    const bHasBoost = bBoost != null;
    if (aHasBoost !== bHasBoost) return aHasBoost ? -1 : 1;
    if (aHasBoost && bHasBoost && aBoost !== bBoost) {
      return aBoost - bBoost;
    }

    const aDefer = isJpVocabWordSameDayNewNeverQuizzed(a, now);
    const bDefer = isJpVocabWordSameDayNewNeverQuizzed(b, now);
    if (aDefer !== bDefer) return aDefer ? 1 : -1;

    const aFront = isJpVocabWordEligibleNeverQuizzedForFront(a, now);
    const bFront = isJpVocabWordEligibleNeverQuizzedForFront(b, now);
    if (aFront !== bFront) return aFront ? -1 : 1;

    const diff =
      jpVocabFinalQuizScore(b, weight, now) -
      jpVocabFinalQuizScore(a, weight, now);
    if (diff !== 0) return diff;
    return a.word.localeCompare(b.word, "ja");
  });
}

/** 列头点击排序：纯数值升序/降序，不受「从未抽查置顶」影响 */
export function sortJpVocabWordsForDisplay(
  words: JpVocabWord[],
  statSort: { key: JpVocabStatSortKey; dir: "asc" | "desc" } | null,
  opts?: { now?: Date; timeWeight?: number }
): JpVocabWord[] {
  const effective = statSort ?? JP_VOCAB_DEFAULT_STAT_SORT;
  return sortJpVocabWordsByStat(words, effective.key, effective.dir, opts);
}
