import {
  KO_PRON_CATEGORIES,
  type KoPronCategory,
} from "@/lib/ko-pron-seed";
import type { KoPronLetter } from "@/lib/types";

export type KoPronCategoryFilter = "all" | KoPronCategory;

export { KO_PRON_CATEGORIES };

function normalizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** 可搜索字段拼成 haystack（小写） */
export function koPronSearchHaystack(letter: KoPronLetter): string {
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

function filterKoPronLettersByCategory(
  letters: KoPronLetter[],
  categoryFilter: KoPronCategoryFilter
): KoPronLetter[] {
  if (categoryFilter === "all") return letters;
  return letters.filter((letter) => (letter.category || "") === categoryFilter);
}

/** 本地模糊搜索 + 分类筛选；空查询返回分类过滤后的列表 */
export function filterKoPronLettersBySearch(
  letters: KoPronLetter[],
  query: string,
  categoryFilter: KoPronCategoryFilter = "all"
): KoPronLetter[] {
  const byCategory = filterKoPronLettersByCategory(letters, categoryFilter);
  const tokens = normalizeSearchQuery(query);
  if (!tokens.length) return byCategory;

  return byCategory.filter((letter) => {
    const haystack = koPronSearchHaystack(letter);
    return tokens.every((token) => haystack.includes(token));
  });
}
