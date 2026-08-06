import {
  formatBeijingDateTime,
  formatBeijingDateTimeCompactParts,
} from "@/lib/format-datetime";
import {
  isEnVocabRoundChecked,
  type EnVocabDailyDisplayOrder,
} from "@/lib/en-vocab-daily-order";
import { applyEnVocabReview } from "@/lib/en-vocab-review";
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
  EN_VOCAB_PAGE_SIZE,
  EN_VOCAB_PAGE_SIZE_OPTIONS,
  EN_VOCAB_PAGE_SIZE_STORAGE_KEY,
  EN_VOCAB_PAGE_STORAGE_KEY,
  EN_VOCAB_SEARCH_HISTORY_MAX,
  EN_VOCAB_SEARCH_HISTORY_STORAGE_KEY,
  EN_VOCAB_SEARCH_KIND_STORAGE_KEY,
  EN_VOCAB_SEARCH_QUERY_STORAGE_KEY,
} from "@/lib/en-vocab-page-constants";
import type { EnVocabKindFilter } from "@/lib/en-vocab-search";
import type { EnVocabLevel, EnVocabWord } from "@/lib/types";

export { VOCAB_SAVE_ERR as EN_VOCAB_SAVE_ERR };

export function readStoredEnVocabPage(): number {
  return readStoredVocabPage(EN_VOCAB_PAGE_STORAGE_KEY);
}

export function writeStoredEnVocabPage(page: number): void {
  writeStoredVocabPage(EN_VOCAB_PAGE_STORAGE_KEY, page);
}

export function readStoredEnVocabPageSize(): number {
  return readStoredVocabPageSize(
    EN_VOCAB_PAGE_SIZE_STORAGE_KEY,
    EN_VOCAB_PAGE_SIZE_OPTIONS,
    EN_VOCAB_PAGE_SIZE
  );
}

export function writeStoredEnVocabPageSize(size: number): void {
  writeStoredVocabPageSize(EN_VOCAB_PAGE_SIZE_STORAGE_KEY, size);
}

export function readStoredEnVocabSearchQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(EN_VOCAB_SEARCH_QUERY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeStoredEnVocabSearchQuery(query: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = query.trim();
    if (!trimmed) {
      window.localStorage.removeItem(EN_VOCAB_SEARCH_QUERY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(EN_VOCAB_SEARCH_QUERY_STORAGE_KEY, query);
  } catch {
    /* ignore storage errors */
  }
}

const EN_VOCAB_KIND_FILTERS: readonly EnVocabKindFilter[] = [
  "all",
  "word",
  "grammar",
];

export function readStoredEnVocabKindFilter(): EnVocabKindFilter {
  if (typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(EN_VOCAB_SEARCH_KIND_STORAGE_KEY);
    if (raw && (EN_VOCAB_KIND_FILTERS as readonly string[]).includes(raw)) {
      return raw as EnVocabKindFilter;
    }
    return "all";
  } catch {
    return "all";
  }
}

export function writeStoredEnVocabKindFilter(kind: EnVocabKindFilter): void {
  if (typeof window === "undefined") return;
  try {
    if (kind === "all") {
      window.localStorage.removeItem(EN_VOCAB_SEARCH_KIND_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(EN_VOCAB_SEARCH_KIND_STORAGE_KEY, kind);
  } catch {
    /* ignore storage errors */
  }
}

export function readStoredEnVocabSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EN_VOCAB_SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, EN_VOCAB_SEARCH_HISTORY_MAX);
  } catch {
    return [];
  }
}

function writeStoredEnVocabSearchHistory(items: string[]): void {
  if (typeof window === "undefined") return;
  try {
    if (!items.length) {
      window.localStorage.removeItem(EN_VOCAB_SEARCH_HISTORY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      EN_VOCAB_SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(items.slice(0, EN_VOCAB_SEARCH_HISTORY_MAX))
    );
  } catch {
    /* ignore storage errors */
  }
}

/** 写入最近搜索：去空白、去重置顶、最多 EN_VOCAB_SEARCH_HISTORY_MAX 条 */
export function pushEnVocabSearchHistory(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return readStoredEnVocabSearchHistory();
  const next = [
    trimmed,
    ...readStoredEnVocabSearchHistory().filter(
      (item) => item.toLowerCase() !== trimmed.toLowerCase()
    ),
  ].slice(0, EN_VOCAB_SEARCH_HISTORY_MAX);
  writeStoredEnVocabSearchHistory(next);
  return next;
}

export function clearEnVocabSearchHistory(): void {
  writeStoredEnVocabSearchHistory([]);
}

export function removeEnVocabSearchHistoryItem(query: string): string[] {
  const trimmed = query.trim();
  const next = readStoredEnVocabSearchHistory().filter(
    (item) => item.toLowerCase() !== trimmed.toLowerCase()
  );
  writeStoredEnVocabSearchHistory(next);
  return next;
}

export function enVocabCheckedInRound(
  order: EnVocabDailyDisplayOrder,
  word: EnVocabWord
): boolean {
  return isEnVocabRoundChecked(order, word.id);
}

export const enVocabWordsInOrder = vocabWordsInOrder<EnVocabWord>;
export const pickRandomEnVocabWord = pickRandomVocabWord<EnVocabWord>;

export function bumpEnVocabWordReview(
  word: EnVocabWord,
  level: EnVocabLevel,
  previousLevel?: EnVocabLevel
): EnVocabWord {
  return applyEnVocabReview(word, level, new Date(), previousLevel).word;
}

/** 管理员表「更新时间」：日期一行、时间一行（对齐新课 dt-stacked） */
export function renderEnVocabUpdatedAt(iso: string) {
  const { date, time } = formatBeijingDateTimeCompactParts(iso);
  return (
    <time
      className="jp-vocab-updated-time jp-vocab-updated-time--stacked"
      dateTime={iso}
      title={formatBeijingDateTime(iso)}
    >
      <span className="jp-vocab-updated-date">{date}</span>
      {time ? <span className="jp-vocab-updated-clock">{time}</span> : null}
    </time>
  );
}
