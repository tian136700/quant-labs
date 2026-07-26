import {
  isJpVocabWordEligibleNeverQuizzedForFront,
  isJpVocabWordSameDayNewNeverQuizzed,
  isJpVocabWordHistNeverQuizzed,
  effectiveTodayCheckCount,
} from "@/lib/jp-vocab-daily-check";
import { hasJpVocabClassNotes } from "@/lib/jp-vocab-class-notes";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  jpVocabFinalQuizScore,
  normalizeJpVocabQuizTimeWeight,
} from "@/lib/jp-vocab-quiz-score";
import {
  isJpVocabWordSrsDue,
  jpVocabSrsDueSortKey,
} from "@/lib/jp-vocab-srs";
import type { JpVocabWord } from "@/lib/types";

/** 除操作列外，表头均可点排序（对齐英语管理员端） */
export type JpVocabStatSortKey =
  | "seq"
  | "kind"
  | "word"
  | "reading"
  | "meaning"
  | "pos"
  | "mnemonic"
  | "very"
  | "normal"
  | "weak"
  | "total"
  | "risk"
  | "level"
  | "today"
  | "notes";

/** 单词表默认排序：合计为 0 的置顶，其余按抽查优先级降序 */
export const JP_VOCAB_DEFAULT_STAT_SORT: {
  key: JpVocabStatSortKey;
  dir: "asc" | "desc";
} = { key: "risk", dir: "desc" };

export type JpVocabStatSortOptions = {
  now?: Date;
  timeWeight?: number;
  dailySeqByWordId?: ReadonlyMap<number, number>;
};

export function jpVocabPriorityLabel(locale: "zh" | "en" = "zh"): string {
  return locale === "zh" ? "抽查优先级" : "Check priority";
}

export function jpVocabTotalReviews(word: JpVocabWord): number {
  return word.cnt_very + word.cnt_normal + word.cnt_weak;
}

/** 合计列展示：0 次时显示「未抽查」等短文案，避免裸数字 0；窄列用 labelLines 两行 */
export function formatJpVocabTotalReviewsDisplay(
  word: JpVocabWord,
  locale: "zh" | "en" = "zh"
): { label: string; labelLines?: [string, string]; isZero: boolean } {
  const total = jpVocabTotalReviews(word);
  if (total === 0) {
    return {
      label: locale === "zh" ? "从未抽查" : "Never",
      labelLines: locale === "zh" ? ["从未", "抽查"] : undefined,
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

function levelSortRank(word: JpVocabWord): number {
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

function cmpJaText(a: string, b: string): number {
  return a.localeCompare(b, "ja", { sensitivity: "base", numeric: true });
}

function compareJpVocabStat(
  a: JpVocabWord,
  b: JpVocabWord,
  key: JpVocabStatSortKey,
  opts?: JpVocabStatSortOptions
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
      return cmpJaText(a.kind || "word", b.kind || "word");
    case "word":
      return cmpJaText(a.word || "", b.word || "");
    case "reading":
      return cmpJaText((a.reading || "").trim(), (b.reading || "").trim());
    case "meaning":
      return cmpJaText((a.meaning || "").trim(), (b.meaning || "").trim());
    case "pos":
      return cmpJaText((a.pos || "").trim(), (b.pos || "").trim());
    case "mnemonic":
      return cmpJaText((a.mnemonic || "").trim(), (b.mnemonic || "").trim());
    case "very":
      return a.cnt_very - b.cnt_very;
    case "normal":
      return a.cnt_normal - b.cnt_normal;
    case "weak":
      return a.cnt_weak - b.cnt_weak;
    case "total":
      return jpVocabTotalReviews(a) - jpVocabTotalReviews(b);
    case "risk": {
      // 从未抽查：列头排序时仍按 +∞（desc 置顶）；两边都从未则相等
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
    case "notes": {
      const na = hasJpVocabClassNotes(a.class_notes, a.class_notes_present) ? 1 : 0;
      const nb = hasJpVocabClassNotes(b.class_notes, b.class_notes_present) ? 1 : 0;
      return na - nb;
    }
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

/** 按表头列排序（同值按单词名） */
export function sortJpVocabWordsByStat(
  words: JpVocabWord[],
  key: JpVocabStatSortKey,
  dir: "asc" | "desc",
  opts?: JpVocabStatSortOptions
): JpVocabWord[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...words].sort((a, b) => {
    const diff = compareJpVocabStat(a, b, key, opts);
    if (diff !== 0) return diff * mul;
    return a.word.localeCompare(b.word, "ja");
  });
}

/**
 * 每日固定序号（凌晨重排）：
 * 1. 管理员标记的「明日优先」按点击顺序 1、2、3…（仅生效日当天）
 * 2. 可置顶的从未抽查（入库日早于今日）在前 —— **不算 final_score / SRS**
 * 3. 其余（已抽查过的）按间隔重复：已到期在前（到期日越早越前），未到期在后（越近到期越前）；
 *    同档再用 final_score 作次要排序
 * 4. 今日刚入库且从未抽查的沉底（今天不抽，明天再置顶）—— **不算分**
 *
 * `srs_due_date` / `srs_interval_days` 在勾选熟悉程度时写入；无 due 的旧数据视为已到期。
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

    // 从未抽查桶内（置顶或沉底）：不算分，只按词名稳定排序
    if (aFront || bFront || aDefer || bDefer) {
      return a.word.localeCompare(b.word, "ja");
    }

    // 已抽查：到期优先（默默/间隔重复）
    const aDue = isJpVocabWordSrsDue(a, now);
    const bDue = isJpVocabWordSrsDue(b, now);
    if (aDue !== bDue) return aDue ? -1 : 1;

    const dueKeyCmp = jpVocabSrsDueSortKey(a, now).localeCompare(
      jpVocabSrsDueSortKey(b, now)
    );
    if (dueKeyCmp !== 0) {
      // 已到期：日期越早越靠前；未到期：越近到期越靠前（同样升序）
      return dueKeyCmp;
    }

    const scoreDiff =
      jpVocabFinalQuizScore(b, weight, now) -
      jpVocabFinalQuizScore(a, weight, now);
    if (scoreDiff !== 0) return scoreDiff;
    return a.word.localeCompare(b.word, "ja");
  });
}

/** 列头点击排序：纯数值/文本升序/降序，不受「从未抽查置顶」影响 */
export function sortJpVocabWordsForDisplay(
  words: JpVocabWord[],
  statSort: { key: JpVocabStatSortKey; dir: "asc" | "desc" } | null,
  opts?: JpVocabStatSortOptions
): JpVocabWord[] {
  const effective = statSort ?? JP_VOCAB_DEFAULT_STAT_SORT;
  return sortJpVocabWordsByStat(words, effective.key, effective.dir, opts);
}
