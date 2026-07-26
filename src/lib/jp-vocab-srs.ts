import {
  beijingDateString,
  isJpVocabWordHistNeverQuizzed,
} from "@/lib/jp-vocab-daily-check";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

/**
 * 间隔重复（默默/艾宾浩斯风格）：勾选熟悉程度后写入
 * `srs_interval_days` + `srs_due_date`；日序「已抽查」桶按是否到期排序。
 *
 * 非常熟悉阶梯（天）：10 → 20 → 30 → 60 → 120 → 180 → 365
 * 一般：首抽 3 天，其后约 ×1.2（上限 60）
 * 不熟悉：固定 1 天后到期
 */

/** 连续「非常熟悉」的间隔阶梯（天） */
export const JP_VOCAB_SRS_VERY_STEPS = [
  10, 20, 30, 60, 120, 180, 365,
] as const;

export const JP_VOCAB_SRS_FIRST_NORMAL_DAYS = 3;
export const JP_VOCAB_SRS_WEAK_DAYS = 1;
export const JP_VOCAB_SRS_NORMAL_MAX_DAYS = 60;

export type JpVocabSrsFields = {
  srs_interval_days: number;
  srs_due_date: string | null;
};

/** 北京日历日加天数（YYYY-MM-DD） */
export function jpVocabAddBeijingCalendarDays(
  ymd: string,
  days: number
): string {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const ms =
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) +
    days * 86_400_000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** 非常熟悉：取阶梯上严格大于 base 的下一档；已满则封顶 */
export function jpVocabSrsNextVeryInterval(baseIntervalDays: number): number {
  const base = Math.max(0, Math.floor(baseIntervalDays));
  for (const step of JP_VOCAB_SRS_VERY_STEPS) {
    if (step > base) return step;
  }
  return JP_VOCAB_SRS_VERY_STEPS[JP_VOCAB_SRS_VERY_STEPS.length - 1];
}

/** 一般：首抽 3 天；否则 ×1.2 取整，夹到 [1, 60] */
export function jpVocabSrsNextNormalInterval(baseIntervalDays: number): number {
  const base = Math.max(0, Math.floor(baseIntervalDays));
  if (base <= 0) return JP_VOCAB_SRS_FIRST_NORMAL_DAYS;
  const next = Math.round(base * 1.2);
  return Math.min(
    JP_VOCAB_SRS_NORMAL_MAX_DAYS,
    Math.max(JP_VOCAB_SRS_WEAK_DAYS, next)
  );
}

/**
 * 今日内改选时，把「当前已写入的间隔」逆推回勾选前的 base。
 * 无法精确还原时偏保守（当作 0 / 上一档）。
 */
export function jpVocabSrsReverseBaseInterval(
  currentIntervalDays: number,
  prevLevel: JpVocabLevel
): number {
  const cur = Math.max(0, Math.floor(currentIntervalDays));
  if (prevLevel === "weak") {
    return 0;
  }
  if (prevLevel === "normal") {
    if (cur === JP_VOCAB_SRS_FIRST_NORMAL_DAYS) return 0;
    return Math.max(0, Math.round(cur / 1.2));
  }
  const idx = JP_VOCAB_SRS_VERY_STEPS.indexOf(
    cur as (typeof JP_VOCAB_SRS_VERY_STEPS)[number]
  );
  if (idx > 0) return JP_VOCAB_SRS_VERY_STEPS[idx - 1];
  if (idx === 0) return 0;
  let prev = 0;
  for (const step of JP_VOCAB_SRS_VERY_STEPS) {
    if (step < cur) prev = step;
  }
  return prev;
}

export function jpVocabSrsNextInterval(
  baseIntervalDays: number,
  level: JpVocabLevel
): number {
  if (level === "weak") return JP_VOCAB_SRS_WEAK_DAYS;
  if (level === "normal") return jpVocabSrsNextNormalInterval(baseIntervalDays);
  return jpVocabSrsNextVeryInterval(baseIntervalDays);
}

/** 根据熟悉程度写入下次间隔与到期日（北京日历） */
export function computeJpVocabSrsAfterReview(
  word: Pick<JpVocabWord, "srs_interval_days" | "srs_due_date">,
  level: JpVocabLevel,
  opts?: {
    /** 今日内改选：先逆推再按新 level 重算 */
    isCorrection?: boolean;
    previousLevel?: JpVocabLevel | null;
    now?: Date;
  }
): JpVocabSrsFields {
  const now = opts?.now ?? new Date();
  const today = beijingDateString(now);
  let base = Math.max(0, Math.floor(Number(word.srs_interval_days) || 0));
  if (opts?.isCorrection && opts.previousLevel) {
    base = jpVocabSrsReverseBaseInterval(base, opts.previousLevel);
  }
  const interval = jpVocabSrsNextInterval(base, level);
  return {
    srs_interval_days: interval,
    srs_due_date: jpVocabAddBeijingCalendarDays(today, interval),
  };
}

/** 已抽查词是否已到复习日（无 due 的旧数据视为已到期，便于迁入新规则） */
export function isJpVocabWordSrsDue(
  word: Pick<
    JpVocabWord,
    "cnt_very" | "cnt_normal" | "cnt_weak" | "srs_due_date"
  >,
  now = new Date()
): boolean {
  if (isJpVocabWordHistNeverQuizzed(word)) return false;
  const due = (word.srs_due_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return true;
  return due <= beijingDateString(now);
}

/** 日序：已到期优先于未到期；到期越早越靠前；无 due 旧数据当作今天到期 */
export function jpVocabSrsDueSortKey(
  word: Pick<JpVocabWord, "srs_due_date">,
  now = new Date()
): string {
  const due = (word.srs_due_date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  return beijingDateString(now);
}
