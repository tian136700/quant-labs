import type { EnVocabKind, EnVocabWord } from "@/lib/types";

export type EnVocabKindFilter = "all" | EnVocabKind;

function normalizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** 可搜索字段拼成 haystack（小写，便于 includes 匹配） */
export function enVocabSearchHaystack(word: EnVocabWord): string {
  const parts = [
    word.word,
    word.reading,
    word.meaning,
    word.pos,
    word.class_notes,
    word.kind === "grammar" ? "语法" : "单词",
  ];
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("\n")
    .toLowerCase();
}

function filterEnVocabWordsByKind(
  words: EnVocabWord[],
  kindFilter: EnVocabKindFilter
): EnVocabWord[] {
  if (kindFilter === "all") return words;
  return words.filter((word) => word.kind === kindFilter);
}

/** 本地模糊搜索：各关键词均需在任一字段中出现（AND）；空查询返回原列表 */
export function filterEnVocabWordsBySearch(
  words: EnVocabWord[],
  query: string,
  kindFilter: EnVocabKindFilter = "all"
): EnVocabWord[] {
  const byKind = filterEnVocabWordsByKind(words, kindFilter);
  const tokens = normalizeSearchQuery(query);
  if (!tokens.length) return byKind;

  return byKind.filter((word) => {
    const haystack = enVocabSearchHaystack(word);
    return tokens.every((token) => haystack.includes(token));
  });
}
