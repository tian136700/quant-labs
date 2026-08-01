import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  isJpVocabRoundChecked,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";
import { applyJpVocabReview } from "@/lib/jp-vocab-review";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
import {
  pickRandomVocabWord,
  readStoredVocabPage,
  readStoredVocabPageSize,
  vocabWordsInOrder,
  writeStoredVocabPage,
  writeStoredVocabPageSize,
  VOCAB_SAVE_ERR,
} from "@/lib/vocab-page-shared";
import {
  JP_VOCAB_PAGE_SIZE,
  JP_VOCAB_PAGE_SIZE_OPTIONS,
  JP_VOCAB_PAGE_SIZE_STORAGE_KEY,
  JP_VOCAB_PAGE_STORAGE_KEY,
  JP_VOCAB_SEARCH_HISTORY_MAX,
  JP_VOCAB_SEARCH_HISTORY_STORAGE_KEY,
  JP_VOCAB_SEARCH_KIND_STORAGE_KEY,
  JP_VOCAB_SEARCH_QUERY_STORAGE_KEY,
  JP_VOCAB_STAT_SORT_STORAGE_KEY,
} from "@/lib/jp-vocab-page-constants";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  type JpVocabStatSortKey,
} from "@/lib/jp-vocab-shared";
import type { JpVocabKindFilter } from "@/lib/jp-vocab-search";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

const JP_VOCAB_STAT_SORT_KEYS: readonly JpVocabStatSortKey[] = [
  "seq",
  "kind",
  "word",
  "reading",
  "meaning",
  "pos",
  "mnemonic",
  "very",
  "normal",
  "weak",
  "total",
  "risk",
  "level",
  "today",
  "notes",
];

export type JpVocabStoredStatSort = {
  key: JpVocabStatSortKey;
  dir: "asc" | "desc";
  /** true = 当日序号顺序（默认）；false = 按 key/dir 手动排序 */
  useDailyRowOrder: boolean;
};

export function defaultJpVocabStoredStatSort(): JpVocabStoredStatSort {
  return {
    key: JP_VOCAB_DEFAULT_STAT_SORT.key,
    dir: JP_VOCAB_DEFAULT_STAT_SORT.dir,
    useDailyRowOrder: true,
  };
}

export function readStoredJpVocabStatSort(): JpVocabStoredStatSort {
  if (typeof window === "undefined") return defaultJpVocabStoredStatSort();
  try {
    const raw = window.localStorage.getItem(JP_VOCAB_STAT_SORT_STORAGE_KEY);
    if (!raw) return defaultJpVocabStoredStatSort();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return defaultJpVocabStoredStatSort();
    }
    const obj = parsed as Record<string, unknown>;
    const key = obj.key;
    const dir = obj.dir;
    const useDaily =
      typeof obj.useDailyRowOrder === "boolean" ? obj.useDailyRowOrder : true;
    if (
      typeof key !== "string" ||
      !(JP_VOCAB_STAT_SORT_KEYS as readonly string[]).includes(key)
    ) {
      return defaultJpVocabStoredStatSort();
    }
    if (dir !== "asc" && dir !== "desc") {
      return defaultJpVocabStoredStatSort();
    }
    return {
      key: key as JpVocabStatSortKey,
      dir,
      useDailyRowOrder: useDaily,
    };
  } catch {
    return defaultJpVocabStoredStatSort();
  }
}

export function writeStoredJpVocabStatSort(value: JpVocabStoredStatSort): void {
  if (typeof window === "undefined") return;
  try {
    const defaults = defaultJpVocabStoredStatSort();
    if (
      value.useDailyRowOrder &&
      value.key === defaults.key &&
      value.dir === defaults.dir
    ) {
      window.localStorage.removeItem(JP_VOCAB_STAT_SORT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      JP_VOCAB_STAT_SORT_STORAGE_KEY,
      JSON.stringify({
        key: value.key,
        dir: value.dir,
        useDailyRowOrder: value.useDailyRowOrder,
      })
    );
  } catch {
    /* ignore storage errors */
  }
}

export { VOCAB_SAVE_ERR as JP_VOCAB_SAVE_ERR };

export function readStoredJpVocabPage(): number {
  return readStoredVocabPage(JP_VOCAB_PAGE_STORAGE_KEY);
}

export function writeStoredJpVocabPage(page: number): void {
  writeStoredVocabPage(JP_VOCAB_PAGE_STORAGE_KEY, page);
}

export function readStoredJpVocabPageSize(): number {
  return readStoredVocabPageSize(
    JP_VOCAB_PAGE_SIZE_STORAGE_KEY,
    JP_VOCAB_PAGE_SIZE_OPTIONS,
    JP_VOCAB_PAGE_SIZE
  );
}

export function writeStoredJpVocabPageSize(size: number): void {
  writeStoredVocabPageSize(JP_VOCAB_PAGE_SIZE_STORAGE_KEY, size);
}

export function readStoredJpVocabSearchQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(JP_VOCAB_SEARCH_QUERY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeStoredJpVocabSearchQuery(query: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = query.trim();
    if (!trimmed) {
      window.localStorage.removeItem(JP_VOCAB_SEARCH_QUERY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(JP_VOCAB_SEARCH_QUERY_STORAGE_KEY, query);
  } catch {
    /* ignore storage errors */
  }
}

const JP_VOCAB_KIND_FILTERS: readonly JpVocabKindFilter[] = [
  "all",
  "word",
  "grammar",
];

export function readStoredJpVocabKindFilter(): JpVocabKindFilter {
  if (typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(JP_VOCAB_SEARCH_KIND_STORAGE_KEY);
    if (raw && (JP_VOCAB_KIND_FILTERS as readonly string[]).includes(raw)) {
      return raw as JpVocabKindFilter;
    }
    return "all";
  } catch {
    return "all";
  }
}

export function writeStoredJpVocabKindFilter(kind: JpVocabKindFilter): void {
  if (typeof window === "undefined") return;
  try {
    if (kind === "all") {
      window.localStorage.removeItem(JP_VOCAB_SEARCH_KIND_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(JP_VOCAB_SEARCH_KIND_STORAGE_KEY, kind);
  } catch {
    /* ignore storage errors */
  }
}

export function readStoredJpVocabSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(JP_VOCAB_SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, JP_VOCAB_SEARCH_HISTORY_MAX);
  } catch {
    return [];
  }
}

function writeStoredJpVocabSearchHistory(items: string[]): void {
  if (typeof window === "undefined") return;
  try {
    if (!items.length) {
      window.localStorage.removeItem(JP_VOCAB_SEARCH_HISTORY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      JP_VOCAB_SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(items.slice(0, JP_VOCAB_SEARCH_HISTORY_MAX))
    );
  } catch {
    /* ignore storage errors */
  }
}

/** 写入最近搜索：去空白、去重置顶、最多 JP_VOCAB_SEARCH_HISTORY_MAX 条 */
export function pushJpVocabSearchHistory(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return readStoredJpVocabSearchHistory();
  const next = [
    trimmed,
    ...readStoredJpVocabSearchHistory().filter(
      (item) => item.toLowerCase() !== trimmed.toLowerCase()
    ),
  ].slice(0, JP_VOCAB_SEARCH_HISTORY_MAX);
  writeStoredJpVocabSearchHistory(next);
  return next;
}

export function clearJpVocabSearchHistory(): void {
  writeStoredJpVocabSearchHistory([]);
}

export function removeJpVocabSearchHistoryItem(query: string): string[] {
  const trimmed = query.trim();
  const next = readStoredJpVocabSearchHistory().filter(
    (item) => item.toLowerCase() !== trimmed.toLowerCase()
  );
  writeStoredJpVocabSearchHistory(next);
  return next;
}

export function jpVocabShareProgressPercent(elapsedMs: number): number {
  return jpVocabSaveProgressPercent(elapsedMs);
}

export async function animateJpVocabShareProgressTo100(
  wordId: number,
  startedAtMs: number,
  setPercent: (wordId: number, percent: number) => void
): Promise<void> {
  await animateJpVocabSaveProgressTo100(startedAtMs, (percent) =>
    setPercent(wordId, percent)
  );
}

export function jpVocabCheckedInRound(
  order: JpVocabDailyDisplayOrder,
  word: JpVocabWord
): boolean {
  if (order.date !== beijingDateString()) return false;
  return isJpVocabRoundChecked(order, word.id);
}

export const jpVocabWordsInOrder = vocabWordsInOrder<JpVocabWord>;
export const pickRandomJpVocabWord = pickRandomVocabWord<JpVocabWord>;

export function bumpJpVocabWordReview(
  word: JpVocabWord,
  level: JpVocabLevel,
  previousLevel?: JpVocabLevel,
  options?: { countTowardDailyQuiz?: boolean }
): JpVocabWord {
  return applyJpVocabReview(word, level, new Date(), previousLevel, options)
    .word;
}
