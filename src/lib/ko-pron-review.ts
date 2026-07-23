import {
  beijingDateString,
  beijingDateTimeString,
} from "@/lib/jp-vocab-daily-check";
import { reviewTimestampMs } from "@/lib/jp-vocab-review";
import type { KoPronLetter, KoPronLevel } from "@/lib/types";

const KO_PRON_LEVELS: KoPronLevel[] = ["very", "normal", "weak"];

/** 勾选熟悉程度后满 1 小时不可再改（与日语抽问一致） */
export const KO_PRON_REVIEW_LOCK_MS = 60 * 60 * 1000;

export function isKoPronReviewToday(
  lastAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!lastAt) return false;
  return lastAt.slice(0, 10) === beijingDateString(now);
}

export function effectiveKoPronDisplayLevel(
  letter: KoPronLetter,
  sessionLevel?: KoPronLevel,
  now = new Date()
): KoPronLevel | undefined {
  if (sessionLevel) return sessionLevel;
  const level = letter.last_review_level;
  if (
    level &&
    KO_PRON_LEVELS.includes(level) &&
    isKoPronReviewToday(letter.last_review_at, now)
  ) {
    return level;
  }
  return undefined;
}

/**
 * 今日已勾选且距上次勾选已满 1 小时 → 锁定，不可再改选。
 * 1 小时内改选视为修正原选项（见 applyKoPronReview）。
 */
export function isKoPronLetterReviewLocked(
  letter: KoPronLetter,
  opts?: { sessionReviewAtMs?: number; now?: Date }
): boolean {
  const now = opts?.now ?? new Date();
  const today = beijingDateString(now);

  let reviewMs: number | null = null;
  if (opts?.sessionReviewAtMs != null) {
    const sessionDay = beijingDateString(new Date(opts.sessionReviewAtMs));
    if (sessionDay === today) {
      reviewMs = opts.sessionReviewAtMs;
    }
  }
  if (isKoPronReviewToday(letter.last_review_at, now)) {
    const storedMs = reviewTimestampMs(letter.last_review_at);
    if (storedMs != null && storedMs > 0) {
      reviewMs = reviewMs == null ? storedMs : Math.max(reviewMs, storedMs);
    }
  }
  if (reviewMs == null || reviewMs <= 0) return false;
  return now.getTime() - reviewMs >= KO_PRON_REVIEW_LOCK_MS;
}

function adjustLevelCount(
  letter: KoPronLetter,
  level: KoPronLevel,
  delta: number
): Pick<KoPronLetter, "cnt_very" | "cnt_normal" | "cnt_weak"> {
  const bump = (n: number) => Math.max(0, n + delta);
  return {
    cnt_very: level === "very" ? bump(letter.cnt_very) : letter.cnt_very,
    cnt_normal: level === "normal" ? bump(letter.cnt_normal) : letter.cnt_normal,
    cnt_weak: level === "weak" ? bump(letter.cnt_weak) : letter.cnt_weak,
  };
}

function nextTodayCheckCount(
  count: number,
  date: string | null | undefined,
  now = new Date()
): { count: number; date: string } {
  const today = beijingDateString(now);
  if (date === today) {
    return { count: Math.max(0, count) + 1, date: today };
  }
  return { count: 1, date: today };
}

export function applyKoPronReview(
  letter: KoPronLetter,
  level: KoPronLevel,
  now = new Date()
): { letter: KoPronLetter; isCorrection: boolean } {
  const ts = beijingDateTimeString(now);
  const prev =
    isKoPronReviewToday(letter.last_review_at, now) &&
    letter.last_review_level &&
    KO_PRON_LEVELS.includes(letter.last_review_level)
      ? letter.last_review_level
      : null;

  if (prev) {
    if (prev === level) {
      return {
        letter: {
          ...letter,
          last_review_level: level,
          last_review_at: ts,
          updated_at: ts,
        },
        isCorrection: true,
      };
    }
    const afterPrev = { ...letter, ...adjustLevelCount(letter, prev, -1) };
    return {
      letter: {
        ...afterPrev,
        ...adjustLevelCount(afterPrev, level, 1),
        last_review_level: level,
        last_review_at: ts,
        updated_at: ts,
      },
      isCorrection: true,
    };
  }

  const daily = nextTodayCheckCount(
    letter.today_check_count ?? 0,
    letter.today_check_date,
    now
  );
  return {
    letter: {
      ...letter,
      ...adjustLevelCount(letter, level, 1),
      today_check_count: daily.count,
      today_check_date: daily.date,
      last_review_level: level,
      last_review_at: ts,
      updated_at: ts,
    },
    isCorrection: false,
  };
}

export function koPronTodayChecked(
  letter: Pick<KoPronLetter, "today_check_count" | "today_check_date">,
  now = new Date()
): boolean {
  const today = beijingDateString(now);
  return (letter.today_check_date ?? "") === today && (letter.today_check_count ?? 0) > 0;
}

export function koPronTodayCheckStats(
  letters: ReadonlyArray<
    Pick<KoPronLetter, "today_check_count" | "today_check_date">
  >,
  now = new Date()
): { wordCount: number } {
  let wordCount = 0;
  for (const letter of letters) {
    if (koPronTodayChecked(letter, now)) wordCount += 1;
  }
  return { wordCount };
}
