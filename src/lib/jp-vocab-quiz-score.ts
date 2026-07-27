import {
  beijingDateString,
  isJpVocabWordHistNeverQuizzed,
  jpVocabWordEnteredBeijingDate,
} from "@/lib/jp-vocab-daily-check";
import type { JpVocabWord } from "@/lib/types";

/** jp_vocab_setting.key：历史时间权重 key（已固定默认，不再读写） */
export const JP_VOCAB_QUIZ_TIME_WEIGHT_KEY = "quiz_time_weight";

/** 固定：priority + days × 0.1（同档打平；日序主依据为 SRS） */
export const JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT = 0.1;

const WEIGHT_MIN = 0;
const WEIGHT_MAX = 2;

/**
 * 规范化时间权重。非法 / 空 → 默认 0.1；夹到 [0, 2]，保留最多 2 位小数。
 */
export function normalizeJpVocabQuizTimeWeight(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.trim())
        : NaN;
  if (!Number.isFinite(n)) return JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT;
  const clamped = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, n));
  return Math.round(clamped * 100) / 100;
}

/** 两个北京日历日之间的整天数（to − from，下限 0） */
export function jpVocabBeijingCalendarDaysBetween(
  fromYmd: string,
  toYmd: string
): number {
  const parse = (ymd: string): number | null => {
    const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const a = parse(fromYmd);
  const b = parse(toYmd);
  if (a == null || b == null) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * 是否参与 final_score 计算。
 * 从未抽查（合计 0）不算优先级：日序靠「从未抽查置顶」桶，不走公式。
 */
export function jpVocabAppliesFinalQuizScore(
  word: Pick<JpVocabWord, "cnt_very" | "cnt_normal" | "cnt_weak">
): boolean {
  return !isJpVocabWordHistNeverQuizzed(word);
}

/**
 * 距最后一次抽问的天数（北京日历）。
 * 仅应对「已抽查过」的词调用；从未抽查请用 jpVocabAppliesFinalQuizScore 先判断。
 * 优先 `last_review_at`；缺省回退 `created_at`；再缺则 0。
 */
export function jpVocabDaysSinceLastReview(
  word: Pick<JpVocabWord, "last_review_at" | "created_at">,
  now = new Date()
): number {
  const today = beijingDateString(now);
  const fromAt = (word.last_review_at || "").trim().slice(0, 10);
  const last =
    /^\d{4}-\d{2}-\d{2}$/.test(fromAt)
      ? fromAt
      : jpVocabWordEnteredBeijingDate(word.created_at);
  if (!last) return 0;
  return jpVocabBeijingCalendarDaysBetween(last, today);
}

/** 与 jpVocabRiskIndex 同公式（本文件不依赖 shared，避免循环 import） */
function jpVocabPriorityRaw(
  word: Pick<JpVocabWord, "cnt_very" | "cnt_normal" | "cnt_weak">
): number {
  const raw = word.cnt_normal * 1 + word.cnt_weak * 2 - word.cnt_very * 0.3;
  return Math.round(raw * 10) / 10;
}

/**
 * 最终抽问得分 = 抽查优先级 + 距上次抽问天数 × 时间权重。
 * 保留 1 位小数。
 * **从未抽查请勿用此值排序/展示**——应先 jpVocabAppliesFinalQuizScore；或用 OrNull。
 */
export function jpVocabFinalQuizScore(
  word: Pick<
    JpVocabWord,
    "cnt_very" | "cnt_normal" | "cnt_weak" | "last_review_at" | "created_at"
  >,
  timeWeight: number = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  now = new Date()
): number {
  const weight = normalizeJpVocabQuizTimeWeight(timeWeight);
  const priority = jpVocabPriorityRaw(word);
  const days = jpVocabDaysSinceLastReview(word, now);
  const raw = priority + days * weight;
  return Math.round(raw * 10) / 10;
}

/** 从未抽查 → null（不算分）；已抽查 → final_score */
export function jpVocabFinalQuizScoreOrNull(
  word: Pick<
    JpVocabWord,
    "cnt_very" | "cnt_normal" | "cnt_weak" | "last_review_at" | "created_at"
  >,
  timeWeight: number = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  now = new Date()
): number | null {
  if (!jpVocabAppliesFinalQuizScore(word)) return null;
  return jpVocabFinalQuizScore(word, timeWeight, now);
}
