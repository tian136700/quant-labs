import type { JpVocabLevel, JpVocabWord } from "@/lib/types";
import {
  beijingDateString,
  nextTodayCheckCount,
} from "@/lib/jp-vocab-daily-check";
import {
  isJpVocabRoundChecked,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";

const JP_VOCAB_LEVELS: JpVocabLevel[] = ["very", "normal", "weak"];

/** 最近一次熟悉程度勾选是否发生在今日（北京时间） */
export function isJpVocabReviewToday(
  lastAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!lastAt) return false;
  return lastAt.slice(0, 10) === beijingDateString(now);
}

/** 表格回显：仅当前轮次（round_checked）且今日勾选显示打勾；跨日/今日重置后清空回显，统计次数保留 */
export function effectiveJpVocabDisplayLevel(
  word: JpVocabWord,
  sessionLevel?: JpVocabLevel,
  opts?: {
    now?: Date;
    displayOrder?: JpVocabDailyDisplayOrder;
  }
): JpVocabLevel | undefined {
  if (sessionLevel) return sessionLevel;
  const now = opts?.now ?? new Date();
  const order = opts?.displayOrder;
  if (order?.date) {
    if (order.date !== beijingDateString(now)) return undefined;
    if (!isJpVocabRoundChecked(order, word.id)) return undefined;
  }
  const level = word.last_review_level;
  if (
    level &&
    JP_VOCAB_LEVELS.includes(level) &&
    isJpVocabReviewToday(word.last_review_at, now)
  ) {
    return level;
  }
  return undefined;
}

export function reviewTimestampMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

/** 同一单词今日内改选熟悉程度，视为修正上次判断，不重复计次 */
export function isJpVocabReviewCorrection(
  lastLevel: JpVocabLevel | null | undefined,
  lastAt: string | null | undefined,
  now = new Date()
): lastLevel is JpVocabLevel {
  if (!lastLevel || !lastAt) return false;
  if (!JP_VOCAB_LEVELS.includes(lastLevel)) return false;
  return isJpVocabReviewToday(lastAt, now);
}

export function formatReviewIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function adjustLevelCount(
  word: JpVocabWord,
  level: JpVocabLevel,
  delta: number
): Pick<JpVocabWord, "cnt_very" | "cnt_normal" | "cnt_weak"> {
  const bump = (n: number) => Math.max(0, n + delta);
  return {
    cnt_very: level === "very" ? bump(word.cnt_very) : word.cnt_very,
    cnt_normal: level === "normal" ? bump(word.cnt_normal) : word.cnt_normal,
    cnt_weak: level === "weak" ? bump(word.cnt_weak) : word.cnt_weak,
  };
}

export function resolveJpVocabPreviousLevel(
  word: JpVocabWord,
  opts: {
    sessionLevel?: JpVocabLevel;
    sessionReviewAtMs?: number;
    nowMs?: number;
  } = {}
): JpVocabLevel | null {
  const nowMs = opts.nowMs ?? Date.now();
  const now = new Date(nowMs);
  if (opts.sessionLevel && opts.sessionReviewAtMs != null) {
    const sessionDay = beijingDateString(new Date(opts.sessionReviewAtMs));
    if (sessionDay === beijingDateString(now)) {
      return opts.sessionLevel;
    }
  }
  if (isJpVocabReviewCorrection(word.last_review_level, word.last_review_at, now)) {
    return word.last_review_level ?? null;
  }
  return null;
}

/** 应用一次熟悉程度勾选（新抽查 or 今日内改选修正） */
export function applyJpVocabReview(
  word: JpVocabWord,
  level: JpVocabLevel,
  now = new Date(),
  previousLevel?: JpVocabLevel | null
): { word: JpVocabWord; isCorrection: boolean } {
  const ts = formatReviewIso(now);
  const prev =
    previousLevel ??
    resolveJpVocabPreviousLevel(word, { nowMs: now.getTime() });

  if (prev) {
    if (prev === level) {
      return {
        word: {
          ...word,
          last_review_level: level,
          last_review_at: ts,
          updated_at: ts,
        },
        isCorrection: true,
      };
    }
    const afterPrev = { ...word, ...adjustLevelCount(word, prev, -1) };
    return {
      word: {
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
    word.today_check_count ?? 0,
    word.today_check_date,
    now
  );
  return {
    word: {
      ...word,
      ...adjustLevelCount(word, level, 1),
      today_check_count: daily.count,
      today_check_date: daily.date,
      last_review_level: level,
      last_review_at: ts,
      updated_at: ts,
    },
    isCorrection: false,
  };
}

/** 撤销共享时自动标记的熟悉程度（仅当今日最后一次勾选仍为该 level 时生效） */
export function revertJpVocabAutoShareReview(
  word: JpVocabWord,
  level: JpVocabLevel,
  now = new Date()
): JpVocabWord {
  const ts = formatReviewIso(now);
  const today = beijingDateString(now);
  if (word.last_review_level !== level) return word;
  if (word.last_review_at && word.last_review_at.slice(0, 10) !== today) {
    return word;
  }

  const counts = adjustLevelCount(word, level, -1);
  let today_check_count = word.today_check_count ?? 0;
  let today_check_date = word.today_check_date ?? null;
  if (today_check_date === today) {
    today_check_count = Math.max(0, today_check_count - 1);
    if (today_check_count === 0) today_check_date = null;
  }

  return {
    ...word,
    ...counts,
    today_check_count,
    today_check_date,
    last_review_level: null,
    last_review_at: null,
    updated_at: ts,
  };
}
