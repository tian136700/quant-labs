import { parseStoredUtcDateTimeMs } from "@/lib/format-datetime";
import { effectiveTodayCheckCount } from "@/lib/en-vocab-daily-check";
import { hasEnVocabClassNotes } from "@/lib/en-vocab-class-notes";
import {
  isJpVocabWordEligibleNeverQuizzedForFront,
  isJpVocabWordHistNeverQuizzed,
  isJpVocabWordSameDayNewNeverQuizzed,
} from "@/lib/jp-vocab-daily-check";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  jpVocabFinalQuizScore,
  jpVocabFinalQuizScoreOrNull,
  normalizeJpVocabQuizTimeWeight,
} from "@/lib/jp-vocab-quiz-score";
import {
  isJpVocabWordSrsDue,
  jpVocabSrsDueSortKey,
} from "@/lib/jp-vocab-srs";
import { listEnVocabUsagePointsForDisplay } from "@/lib/en-vocab-usage-examples-display";
import type { EnVocabWord } from "@/lib/types";

/** 管理员端：除勾选/操作外，表头均可点排序 */
export type EnVocabStatSortKey =
  | "seq"
  | "kind"
  | "category"
  | "upload_source"
  | "word"
  | "reading"
  | "meaning"
  | "pos"
  | "usage"
  | "mnemonic"
  | "very"
  | "normal"
  | "weak"
  | "total"
  | "risk"
  | "level"
  | "today"
  | "updated"
  | "notes";

/** 单词表默认排序：合计为 0 的置顶，其余按抽查优先级降序 */
export const JP_VOCAB_DEFAULT_STAT_SORT: {
  key: EnVocabStatSortKey;
  dir: "asc" | "desc";
} = { key: "risk", dir: "desc" };

export type EnVocabStatSortOptions = {
  dailySeqByWordId?: ReadonlyMap<number, number>;
  now?: Date;
  timeWeight?: number;
};

export function enVocabPriorityLabel(locale: "zh" | "en" = "zh"): string {
  return locale === "zh" ? "抽查优先级" : "Check priority";
}

export function enVocabTotalReviews(word: EnVocabWord): number {
  return word.cnt_very + word.cnt_normal + word.cnt_weak;
}

/** 合计列展示：0 次时显示「未抽查」等短文案，避免裸数字 0；窄列用 labelLines 两行 */
export function formatEnVocabTotalReviewsDisplay(
  word: EnVocabWord,
  locale: "zh" | "en" = "zh"
): { label: string; labelLines?: [string, string]; isZero: boolean } {
  const total = enVocabTotalReviews(word);
  if (total === 0) {
    return {
      label: locale === "zh" ? "从未抽查" : "Never",
      labelLines: locale === "zh" ? ["从未", "抽查"] : undefined,
      isZero: true,
    };
  }
  return { label: String(total), isZero: false };
}

export function enVocabTotalReviewsZeroHint(locale: "zh" | "en" = "zh"): string {
  return locale === "zh" ? "从未抽查过" : "Never checked";
}

/** 抽查优先级（原始分）= 一般×1 + 不熟悉×2 − 非常熟悉×0.3，保留 1 位小数 */
export function enVocabRiskIndex(word: EnVocabWord): number {
  const raw = word.cnt_normal * 1 + word.cnt_weak * 2 - word.cnt_very * 0.3;
  return Math.round(raw * 10) / 10;
}

/**
 * 最终抽问得分（与日语同公式）：priority + 距上次抽问天数 × 0.1。
 * 从未抽查 → null（不算分，日序靠置顶桶）。
 */
export function enVocabFinalQuizScoreOrNull(
  word: EnVocabWord,
  timeWeight: number = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  now = new Date()
): number | null {
  return jpVocabFinalQuizScoreOrNull(word, timeWeight, now);
}

function updatedAtSortMs(word: EnVocabWord): number {
  const ms = parseStoredUtcDateTimeMs(word.updated_at || "");
  return Number.isFinite(ms) ? ms : 0;
}

function levelSortRank(word: EnVocabWord): number {
  switch (word.last_review_level) {
    case "very":
      return 3;
    case "normal":
      return 2;
    case "weak":
      return 1;
    default:
      return 0;
  }
}

function usageSortRank(word: EnVocabWord): number {
  const n = listEnVocabUsagePointsForDisplay(word.usage).points.length;
  if (n > 0) return n;
  return (word.usage || "").trim() ? 1 : 0;
}

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
}

/** 复习优先级：不熟悉次数降序 → 一般次数降序 → 单词名 */
export function sortEnVocabWords(words: EnVocabWord[]): EnVocabWord[] {
  return [...words].sort((a, b) => {
    if (b.cnt_weak !== a.cnt_weak) return b.cnt_weak - a.cnt_weak;
    if (b.cnt_normal !== a.cnt_normal) return b.cnt_normal - a.cnt_normal;
    return a.word.localeCompare(b.word, "en");
  });
}

function compareEnVocabStat(
  a: EnVocabWord,
  b: EnVocabWord,
  key: EnVocabStatSortKey,
  opts?: EnVocabStatSortOptions
): number {
  const now = opts?.now ?? new Date();
  const timeWeight = normalizeJpVocabQuizTimeWeight(
    opts?.timeWeight ?? JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
  );
  switch (key) {
    case "seq": {
      const seqMap = opts?.dailySeqByWordId;
      const sa = seqMap?.get(a.id) ?? Number.POSITIVE_INFINITY;
      const sb = seqMap?.get(b.id) ?? Number.POSITIVE_INFINITY;
      return sa - sb;
    }
    case "kind":
      return cmpText(a.kind || "word", b.kind || "word");
    case "category":
      return cmpText((a.category || "").trim(), (b.category || "").trim());
    case "upload_source":
      return cmpText(
        (a.upload_source || "").trim(),
        (b.upload_source || "").trim()
      );
    case "word":
      return cmpText(a.word || "", b.word || "");
    case "reading":
      return cmpText((a.reading || "").trim(), (b.reading || "").trim());
    case "meaning":
      return cmpText((a.meaning || "").trim(), (b.meaning || "").trim());
    case "pos":
      return cmpText((a.pos || "").trim(), (b.pos || "").trim());
    case "usage":
      return usageSortRank(a) - usageSortRank(b);
    case "mnemonic":
      return cmpText((a.mnemonic || "").trim(), (b.mnemonic || "").trim());
    case "very":
      return a.cnt_very - b.cnt_very;
    case "normal":
      return a.cnt_normal - b.cnt_normal;
    case "weak":
      return a.cnt_weak - b.cnt_weak;
    case "total":
      return enVocabTotalReviews(a) - enVocabTotalReviews(b);
    case "risk": {
      // 与日语一致：从未抽查按 +∞（desc 置顶）；已抽查用 final_score
      const aNever = isJpVocabWordHistNeverQuizzed(a);
      const bNever = isJpVocabWordHistNeverQuizzed(b);
      if (aNever && bNever) return 0;
      if (aNever) return Number.POSITIVE_INFINITY;
      if (bNever) return Number.NEGATIVE_INFINITY;
      return (
        jpVocabFinalQuizScore(a, timeWeight, now) -
        jpVocabFinalQuizScore(b, timeWeight, now)
      );
    }
    case "level":
      return levelSortRank(a) - levelSortRank(b);
    case "today":
      return (
        effectiveTodayCheckCount(a.today_check_count ?? 0, a.today_check_date) -
        effectiveTodayCheckCount(b.today_check_count ?? 0, b.today_check_date)
      );
    case "updated":
      return updatedAtSortMs(a) - updatedAtSortMs(b);
    case "notes": {
      const na = hasEnVocabClassNotes(a.class_notes, a.class_notes_present) ? 1 : 0;
      const nb = hasEnVocabClassNotes(b.class_notes, b.class_notes_present) ? 1 : 0;
      return na - nb;
    }
  }
}

/** 按表头列排序（同值按单词名） */
export function sortEnVocabWordsByStat(
  words: EnVocabWord[],
  key: EnVocabStatSortKey,
  dir: "asc" | "desc",
  opts?: EnVocabStatSortOptions
): EnVocabWord[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...words].sort((a, b) => {
    const diff = compareEnVocabStat(a, b, key, opts);
    if (diff !== 0) return diff * mul;
    return a.word.localeCompare(b.word, "en");
  });
}

/**
 * 每日固定序号（与日语同一套：从未抽查置顶 + SRS 到期 + final_score）：
 * 1. 可置顶的从未抽查（入库日早于今日）在前 —— 不算 final_score / SRS
 * 2. 已抽查：已到期在前（到期日越早越前），未到期在后；同档再用 final_score
 * 3. 今日刚入库且从未抽查沉底（今天不进前 N 池，次日再置顶）
 */
export function sortEnVocabWordsForDailyOrder(
  words: EnVocabWord[],
  now = new Date(),
  timeWeight: number = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
): EnVocabWord[] {
  const weight = normalizeJpVocabQuizTimeWeight(timeWeight);
  return [...words].sort((a, b) => {
    const aDefer = isJpVocabWordSameDayNewNeverQuizzed(a, now);
    const bDefer = isJpVocabWordSameDayNewNeverQuizzed(b, now);
    if (aDefer !== bDefer) return aDefer ? 1 : -1;

    const aFront = isJpVocabWordEligibleNeverQuizzedForFront(a, now);
    const bFront = isJpVocabWordEligibleNeverQuizzedForFront(b, now);
    if (aFront !== bFront) return aFront ? -1 : 1;

    // 从未抽查桶内：不算分，只按词名稳定排序
    if (aFront || bFront || aDefer || bDefer) {
      return a.word.localeCompare(b.word, "en");
    }

    // 已抽查：到期优先（对齐日语默默/间隔重复）
    const aDue = isJpVocabWordSrsDue(a, now);
    const bDue = isJpVocabWordSrsDue(b, now);
    if (aDue !== bDue) return aDue ? -1 : 1;

    const dueKeyCmp = jpVocabSrsDueSortKey(a, now).localeCompare(
      jpVocabSrsDueSortKey(b, now)
    );
    if (dueKeyCmp !== 0) return dueKeyCmp;

    const diff =
      jpVocabFinalQuizScore(b, weight, now) -
      jpVocabFinalQuizScore(a, weight, now);
    if (diff !== 0) return diff;
    return a.word.localeCompare(b.word, "en");
  });
}

/** 列头点击排序：纯数值/文本升序/降序，不受「从未抽查置顶」影响 */
export function sortEnVocabWordsForDisplay(
  words: EnVocabWord[],
  statSort: { key: EnVocabStatSortKey; dir: "asc" | "desc" } | null,
  opts?: EnVocabStatSortOptions
): EnVocabWord[] {
  const effective = statSort ?? JP_VOCAB_DEFAULT_STAT_SORT;
  return sortEnVocabWordsByStat(words, effective.key, effective.dir, opts);
}
