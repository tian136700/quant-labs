/** 单词 / 语法抽问页通用工具（日语、英语共用） */

export const VOCAB_LEVELS = [
  { key: "very" as const, label: "非常熟悉" },
  { key: "normal" as const, label: "一般" },
  { key: "weak" as const, label: "不熟悉" },
];

export const VOCAB_SAVE_ERR = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

export function pickRandomVocabWord<T extends { id: number }>(
  words: T[],
  excludeId?: number
): T | null {
  if (!words.length) return null;
  const pool =
    excludeId != null && words.length > 1
      ? words.filter((w) => w.id !== excludeId)
      : words;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export function vocabWordsInOrder<T extends { id: number }>(
  words: T[],
  order: number[]
): T[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  const seen = new Set<number>();
  const ordered: T[] = [];
  for (const id of order) {
    const word = byId.get(id);
    if (word) {
      ordered.push(word);
      seen.add(id);
    }
  }
  for (const word of words) {
    if (!seen.has(word.id)) ordered.push(word);
  }
  return ordered;
}

export function readStoredVocabPage(storageKey: string): number {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const page = Number(raw);
    return Number.isInteger(page) && page > 0 ? page : 1;
  } catch {
    return 1;
  }
}

export function writeStoredVocabPage(storageKey: string, page: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(page));
  } catch {
    /* ignore storage errors */
  }
}

export function readStoredVocabPageSize(
  storageKey: string,
  options: readonly number[],
  defaultSize: number
): number {
  if (typeof window === "undefined") return defaultSize;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const size = Number(raw);
    return Number.isInteger(size) && options.includes(size) ? size : defaultSize;
  } catch {
    return defaultSize;
  }
}

export function writeStoredVocabPageSize(
  storageKey: string,
  size: number
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(size));
  } catch {
    /* ignore storage errors */
  }
}
