import {
  beijingDateString,
  jpVocabWordEnteredBeijingDate,
} from "@/lib/jp-vocab-daily-check";
import type { JpVocabWord } from "@/lib/types";

/** jp_vocab_setting.key：抽问时间权重（久未复习抬升 final_score） */
export const JP_VOCAB_QUIZ_TIME_WEIGHT_KEY = "quiz_time_weight";

/** 默认：priority + days × 0.1（约 30 天把 -3 抬回 0） */
export const JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT = 0.1;

/** 管理员端可选预设（也可手填，经 normalize 落入合法区间） */
export const JP_VOCAB_QUIZ_TIME_WEIGHT_PRESETS = [0.05, 0.1, 0.2, 0.3] as const;

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
 * 距最后一次抽问的天数（北京日历）。
 * 优先 `last_review_at`（已有字段，语义即 last_review_date）；
 * 缺省回退 `created_at` 入库日；再缺则 0（兼容旧数据，不炸排序）。
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
 * 保留 1 位小数（与 priority 展示一致）。
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
