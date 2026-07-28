/**
 * 英语词条 / 新课分类标签。
 * 存库用中文展示名；上传可传别名（IELTS/TOEFL、ielts_toefl 等）。
 */

/** 默认分类：现有线上词条均属雅思托福 */
export const EN_VOCAB_DEFAULT_CATEGORY = "雅思托福";

/** 已知分类（UI 下拉；上传也可写自由文本） */
export const EN_VOCAB_CATEGORY_PRESETS = [EN_VOCAB_DEFAULT_CATEGORY] as const;

export type EnVocabCategoryPreset = (typeof EN_VOCAB_CATEGORY_PRESETS)[number];

const CATEGORY_ALIASES: Record<string, string> = {
  雅思托福: EN_VOCAB_DEFAULT_CATEGORY,
  雅思托福单词: EN_VOCAB_DEFAULT_CATEGORY,
  雅思: EN_VOCAB_DEFAULT_CATEGORY,
  托福: EN_VOCAB_DEFAULT_CATEGORY,
  "ielts/toefl": EN_VOCAB_DEFAULT_CATEGORY,
  "ielts／toefl": EN_VOCAB_DEFAULT_CATEGORY,
  ielts_toefl: EN_VOCAB_DEFAULT_CATEGORY,
  ielts: EN_VOCAB_DEFAULT_CATEGORY,
  toefl: EN_VOCAB_DEFAULT_CATEGORY,
  "ielts toefl": EN_VOCAB_DEFAULT_CATEGORY,
};

/**
 * 规范化分类：去空白；空 → 默认「雅思托福」；
 * 常见别名映射到标准名；其它自由文本原样保留（trim 后）。
 */
export function normalizeEnVocabCategory(raw?: string | null): string {
  const t = (raw || "").trim();
  if (!t) return EN_VOCAB_DEFAULT_CATEGORY;
  const mapped = CATEGORY_ALIASES[t.toLowerCase()] ?? CATEGORY_ALIASES[t];
  return mapped || t;
}

/** 列表展示：空则显示默认分类 */
export function displayEnVocabCategory(raw?: string | null): string {
  return normalizeEnVocabCategory(raw);
}
