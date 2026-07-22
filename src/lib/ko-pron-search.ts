import {
  KO_PRON_CATEGORIES,
  type KoPronCategory,
} from "@/lib/ko-pron-seed";

export type KoPronCategoryFilter = "all" | KoPronCategory;

export { KO_PRON_CATEGORIES };

/** 勾选页分类筛选记忆（本机 localStorage；下次进入默认上次所选） */
export const KO_PRON_SELECT_CATEGORY_FILTER_STORAGE_KEY =
  "ko-pron-select-category-filter";

function isKoPronCategoryFilter(value: string): value is KoPronCategoryFilter {
  return value === "all" || (KO_PRON_CATEGORIES as readonly string[]).includes(value);
}

export function readStoredKoPronSelectCategoryFilter(): KoPronCategoryFilter {
  if (typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(
      KO_PRON_SELECT_CATEGORY_FILTER_STORAGE_KEY
    );
    if (!raw) return "all";
    return isKoPronCategoryFilter(raw) ? raw : "all";
  } catch {
    return "all";
  }
}

export function writeStoredKoPronSelectCategoryFilter(
  filter: KoPronCategoryFilter
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KO_PRON_SELECT_CATEGORY_FILTER_STORAGE_KEY,
      filter
    );
  } catch {
    /* ignore storage errors */
  }
}

/** 勾选总库 / 抽问池共用可搜索字段 */
export type KoPronSearchable = {
  letter: string;
  reading?: string | null;
  meaning?: string | null;
  category?: string | null;
};

function normalizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** 可搜索字段拼成 haystack（小写） */
export function koPronSearchHaystack(letter: KoPronSearchable): string {
  const parts = [
    letter.letter,
    letter.reading,
    letter.meaning,
    letter.category,
  ];
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("\n")
    .toLowerCase();
}

function filterKoPronByCategory<T extends KoPronSearchable>(
  letters: T[],
  categoryFilter: KoPronCategoryFilter
): T[] {
  if (categoryFilter === "all") return letters;
  return letters.filter((letter) => (letter.category || "") === categoryFilter);
}

/** 本地模糊搜索 + 分类筛选；空查询返回分类过滤后的列表 */
export function filterKoPronLettersBySearch<T extends KoPronSearchable>(
  letters: T[],
  query: string,
  categoryFilter: KoPronCategoryFilter = "all"
): T[] {
  const byCategory = filterKoPronByCategory(letters, categoryFilter);
  const tokens = normalizeSearchQuery(query);
  if (!tokens.length) return byCategory;

  return byCategory.filter((letter) => {
    const haystack = koPronSearchHaystack(letter);
    return tokens.every((token) => haystack.includes(token));
  });
}
