import { pinyin } from "pinyin-pro";

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function pinyinKeys(label: string): string[] {
  const hasHan = /[\u4e00-\u9fff]/.test(label);
  if (!hasHan) return [];

  const full = pinyin(label, { toneType: "none", type: "array" }).join("");
  const first = pinyin(label, { pattern: "first", toneType: "none" }).replace(
    /\s/g,
    ""
  );
  return [full, first].map((s) => s.toLowerCase());
}

export function matchesNavSearch(label: string, query: string): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;

  const labelLower = label.toLowerCase();
  if (labelLower.includes(q)) return true;

  for (const key of pinyinKeys(label)) {
    if (key.includes(q)) return true;
  }

  return false;
}
