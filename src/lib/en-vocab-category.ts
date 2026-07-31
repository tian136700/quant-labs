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
  /** 托业单独一类，勿并进雅思托福 */
  托业: "托业",
  toeic: "托业",
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

/**
 * 窄列 / iPad 用：至少两个字，方便一眼分辨教材类型（托福 / 托业 / 雅思…）。
 * 完整名仍用 displayEnVocabCategory + title。
 */
export function shortEnVocabCategoryLabel(raw?: string | null): string {
  const full = displayEnVocabCategory(raw);
  const key = full.trim().toLowerCase();

  if (key === "雅思托福" || key === "雅思托福单词") return "雅思";
  if (key === "托福" || key === "toefl") return "托福";
  if (key === "托业" || key === "toeic") return "托业";
  if (key === "雅思" || key === "ielts") return "雅思";

  const chars = Array.from(full);
  if (chars.length <= 2) return full || "—";
  return chars.slice(0, 2).join("");
}
