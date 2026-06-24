import type { JpVocabWord } from "@/lib/types";

export type JpVocabStatSortKey = "very" | "normal" | "weak" | "total" | "risk";

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

/** 抽查优先级 = 一般×1 + 不熟悉×2 − 非常熟悉×0.3，保留 1 位小数 */
export function jpVocabRiskIndex(word: JpVocabWord): number {
  const raw = word.cnt_normal * 1 + word.cnt_weak * 2 - word.cnt_very * 0.3;
  return Math.round(raw * 10) / 10;
}

function statSortValue(word: JpVocabWord, key: JpVocabStatSortKey): number {
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
      return jpVocabRiskIndex(word);
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

function compareZeroTotalFirst(a: JpVocabWord, b: JpVocabWord): number {
  const aZero = jpVocabTotalReviews(a) === 0;
  const bZero = jpVocabTotalReviews(b) === 0;
  if (aZero === bZero) return 0;
  return aZero ? -1 : 1;
}

/** 按复习次数单列排序（同值按单词名） */
export function sortJpVocabWordsByStat(
  words: JpVocabWord[],
  key: JpVocabStatSortKey,
  dir: "asc" | "desc"
): JpVocabWord[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...words].sort((a, b) => {
    const diff = statSortValue(a, key) - statSortValue(b, key);
    if (diff !== 0) return diff * mul;
    return a.word.localeCompare(b.word, "ja");
  });
}

export function sortJpVocabWordsForDisplay(
  words: JpVocabWord[],
  statSort: { key: JpVocabStatSortKey; dir: "asc" | "desc" } | null
): JpVocabWord[] {
  const effective = statSort ?? JP_VOCAB_DEFAULT_STAT_SORT;

  if (effective.key === "risk") {
    const mul = effective.dir === "asc" ? 1 : -1;
    return [...words].sort((a, b) => {
      const zeroCmp = compareZeroTotalFirst(a, b);
      if (zeroCmp !== 0) return zeroCmp;
      const diff = jpVocabRiskIndex(a) - jpVocabRiskIndex(b);
      if (diff !== 0) return diff * mul;
      return a.word.localeCompare(b.word, "ja");
    });
  }

  return sortJpVocabWordsByStat(words, effective.key, effective.dir);
}
