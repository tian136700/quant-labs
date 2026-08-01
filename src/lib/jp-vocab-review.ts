import type { JpVocabLevel, JpVocabWord } from "@/lib/types";
import {
  beijingDateString,
  effectiveTodayCheckCount,
  isJpVocabWordQuizzedToday,
  nextTodayCheckCount,
  beijingDateTimeString,
} from "@/lib/jp-vocab-daily-check";
import {
  isJpVocabRoundChecked,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";
import { parseBeijingDateTime } from "@/lib/jp-lesson-shared";
import { computeJpVocabSrsAfterReview } from "@/lib/jp-vocab-srs";

const JP_VOCAB_LEVELS: JpVocabLevel[] = ["very", "normal", "weak"];

/** 最近一次熟悉程度勾选是否发生在今日（北京时间） */
export function isJpVocabReviewToday(
  lastAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!lastAt) return false;
  return lastAt.slice(0, 10) === beijingDateString(now);
}

/** 学生端「老师勾选」：仅当老师今日已勾选熟悉程度时才有值 */
export function resolveJpVocabSharedTeacherLevel(
  word: JpVocabWord,
  now = new Date()
): JpVocabLevel | undefined {
  if (
    effectiveTodayCheckCount(
      word.today_check_count ?? 0,
      word.today_check_date,
      now
    ) <= 0
  ) {
    return undefined;
  }
  if (!isJpVocabReviewToday(word.last_review_at, now)) return undefined;
  const level = word.last_review_level;
  if (level && JP_VOCAB_LEVELS.includes(level)) return level;
  return undefined;
}

/**
 * 表格 / 抽查卡回显与「是否已勾」：sessionLevel 优先；
 * 否则须今日已抽。有 displayOrder 时优先 round_checked，
 * 但今日已计次（today_check）仍认——防 sync/缓存短暂丢 round_checked
 * 导致调高抽查数量后已勾词又进待抽队列（与英语 effectiveEnVocabDisplayLevel 对齐）。
 */
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
  const level = word.last_review_level;
  const reviewedToday =
    Boolean(level) &&
    JP_VOCAB_LEVELS.includes(level as JpVocabLevel) &&
    (isJpVocabWordQuizzedToday(word, now) ||
      isJpVocabReviewToday(word.last_review_at, now));
  if (!reviewedToday || !level) return undefined;

  const order = opts?.displayOrder;
  if (order?.date) {
    if (order.date !== beijingDateString(now)) return undefined;
    // 本轮 round_checked；若今日已计次则仍认（防丢 round_checked → 已勾又要再勾）
    if (
      !isJpVocabRoundChecked(order, word.id) &&
      !isJpVocabWordQuizzedToday(word, now)
    ) {
      return undefined;
    }
  }
  return level;
}

export function reviewTimestampMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  if (!iso.includes("T")) {
    const beijing = parseBeijingDateTime(iso);
    if (beijing) return beijing.getTime();
  }
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
  return beijingDateTimeString(now);
}

/** 勾选熟悉程度后满 1 小时不可再改；发给学生 / 点「下一个」同步不受此锁 */
export const JP_VOCAB_REVIEW_LOCK_MS = 60 * 60 * 1000;

function effectiveReviewTimestampMs(
  word: JpVocabWord,
  sessionReviewAtMs?: number,
  now = new Date()
): number | null {
  const storedMs = reviewTimestampMs(word.last_review_at);
  if (sessionReviewAtMs != null) {
    const sessionDay = beijingDateString(new Date(sessionReviewAtMs));
    if (sessionDay === beijingDateString(now)) {
      return Math.max(storedMs ?? 0, sessionReviewAtMs);
    }
  }
  return storedMs;
}

export function hasJpVocabReviewToday(
  word: JpVocabWord,
  sessionReviewAtMs?: number,
  now = new Date()
): boolean {
  if (sessionReviewAtMs != null) {
    const sessionDay = beijingDateString(new Date(sessionReviewAtMs));
    if (sessionDay === beijingDateString(now)) return true;
  }
  return isJpVocabReviewToday(word.last_review_at, now);
}

/** 今日已勾选且距上次勾选已满 1 小时 */
export function isJpVocabWordReviewLocked(
  word: JpVocabWord,
  opts?: { sessionReviewAtMs?: number; now?: Date }
): boolean {
  const now = opts?.now ?? new Date();
  if (!hasJpVocabReviewToday(word, opts?.sessionReviewAtMs, now)) return false;
  const reviewMs = effectiveReviewTimestampMs(word, opts?.sessionReviewAtMs, now);
  if (reviewMs == null || reviewMs <= 0) return false;
  return now.getTime() - reviewMs >= JP_VOCAB_REVIEW_LOCK_MS;
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

export type ApplyJpVocabReviewOptions = {
  /**
   * 是否计入今日抽查名额（写 today_check_*）。
   * 管理员勾「非常熟悉」跳过今日池时传 false：仍更新熟悉程度 / SRS，但不占 N。
   */
  countTowardDailyQuiz?: boolean;
};

/**
 * 管理员勾「非常熟悉」且未计入今日抽查名额：
 * 老师可见池应跳过该词，进度条不占今日目标。
 */
export function isJpVocabAdminVerySkipToday(
  word: Pick<
    JpVocabWord,
    | "last_review_level"
    | "last_review_at"
    | "today_check_count"
    | "today_check_date"
  >,
  now = new Date()
): boolean {
  if (word.last_review_level !== "very") return false;
  if (!isJpVocabReviewToday(word.last_review_at, now)) return false;
  return (
    effectiveTodayCheckCount(
      word.today_check_count ?? 0,
      word.today_check_date,
      now
    ) <= 0
  );
}

/** 应用一次熟悉程度勾选（新抽查 or 今日内改选修正） */
export function applyJpVocabReview(
  word: JpVocabWord,
  level: JpVocabLevel,
  now = new Date(),
  previousLevel?: JpVocabLevel | null,
  options?: ApplyJpVocabReviewOptions
): { word: JpVocabWord; isCorrection: boolean } {
  const ts = formatReviewIso(now);
  const prev =
    previousLevel ??
    resolveJpVocabPreviousLevel(word, { nowMs: now.getTime() });
  const countTowardDailyQuiz = options?.countTowardDailyQuiz !== false;

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
    const srs = computeJpVocabSrsAfterReview(word, level, {
      isCorrection: true,
      previousLevel: prev,
      now,
    });
    return {
      word: {
        ...afterPrev,
        ...adjustLevelCount(afterPrev, level, 1),
        ...srs,
        last_review_level: level,
        last_review_at: ts,
        updated_at: ts,
      },
      isCorrection: true,
    };
  }

  const srs = computeJpVocabSrsAfterReview(word, level, { now });
  if (!countTowardDailyQuiz) {
    return {
      word: {
        ...word,
        ...adjustLevelCount(word, level, 1),
        ...srs,
        last_review_level: level,
        last_review_at: ts,
        updated_at: ts,
      },
      isCorrection: false,
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
      ...srs,
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
    srs_interval_days: 0,
    srs_due_date: null,
    updated_at: ts,
  };
}
