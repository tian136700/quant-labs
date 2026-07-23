import { parseStoredUtcDateTimeMs } from "@/lib/format-datetime";
import type { EnVocabWord } from "@/lib/types";

export type EnVocabStatSortKey =
  | "very"
  | "normal"
  | "weak"
  | "total"
  | "risk"
  | "updated";

/** 单词表默认排序：合计为 0 的置顶，其余按抽查优先级降序 */
export const JP_VOCAB_DEFAULT_STAT_SORT: {
  key: EnVocabStatSortKey;
  dir: "asc" | "desc";
} = { key: "risk", dir: "desc" };

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

/** 抽查优先级 = 一般×1 + 不熟悉×2 − 非常熟悉×0.3，保留 1 位小数 */
export function enVocabRiskIndex(word: EnVocabWord): number {
  const raw = word.cnt_normal * 1 + word.cnt_weak * 2 - word.cnt_very * 0.3;
  return Math.round(raw * 10) / 10;
}

function statSortValue(
  word: EnVocabWord,
  key: Exclude<EnVocabStatSortKey, "updated">
): number {
  switch (key) {
    case "very":
      return word.cnt_very;
    case "normal":
      return word.cnt_normal;
    case "weak":
      return word.cnt_weak;
    case "total":
      return enVocabTotalReviews(word);
    case "risk":
      return enVocabRiskIndex(word);
  }
}

function updatedAtSortMs(word: EnVocabWord): number {
  const ms = parseStoredUtcDateTimeMs(word.updated_at || "");
  return Number.isFinite(ms) ? ms : 0;
}

/** 复习优先级：不熟悉次数降序 → 一般次数降序 → 单词名 */
export function sortEnVocabWords(words: EnVocabWord[]): EnVocabWord[] {
  return [...words].sort((a, b) => {
    if (b.cnt_weak !== a.cnt_weak) return b.cnt_weak - a.cnt_weak;
    if (b.cnt_normal !== a.cnt_normal) return b.cnt_normal - a.cnt_normal;
    return a.word.localeCompare(b.word, "en");
  });
}

function compareZeroTotalFirst(a: EnVocabWord, b: EnVocabWord): number {
  const aZero = enVocabTotalReviews(a) === 0;
  const bZero = enVocabTotalReviews(b) === 0;
  if (aZero === bZero) return 0;
  return aZero ? -1 : 1;
}

/** 按复习次数 / 抽查优先级 / 更新时间单列排序（同值按单词名） */
export function sortEnVocabWordsByStat(
  words: EnVocabWord[],
  key: EnVocabStatSortKey,
  dir: "asc" | "desc"
): EnVocabWord[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...words].sort((a, b) => {
    const diff =
      key === "updated"
        ? updatedAtSortMs(a) - updatedAtSortMs(b)
        : statSortValue(a, key) - statSortValue(b, key);
    if (diff !== 0) return diff * mul;
    return a.word.localeCompare(b.word, "en");
  });
}

/** 每日固定序号用：从未抽查置顶，其余按抽查优先级降序 */
export function sortEnVocabWordsForDailyOrder(words: EnVocabWord[]): EnVocabWord[] {
  return [...words].sort((a, b) => {
    const zeroCmp = compareZeroTotalFirst(a, b);
    if (zeroCmp !== 0) return zeroCmp;
    const diff = enVocabRiskIndex(b) - enVocabRiskIndex(a);
    if (diff !== 0) return diff;
    return a.word.localeCompare(b.word, "en");
  });
}

/** 列头点击排序：纯数值升序/降序，不受「从未抽查置顶」影响 */
export function sortEnVocabWordsForDisplay(
  words: EnVocabWord[],
  statSort: { key: EnVocabStatSortKey; dir: "asc" | "desc" } | null
): EnVocabWord[] {
  const effective = statSort ?? JP_VOCAB_DEFAULT_STAT_SORT;
  return sortEnVocabWordsByStat(words, effective.key, effective.dir);
}
