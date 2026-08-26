/**
 * 英语词条 / 新课分类标签。
 * 存库用中文展示名；上传可传别名（IELTS/TOEFL、ielts_toefl 等）。
 */

/** 默认分类：现有线上词条均属雅思托福 */
export const EN_VOCAB_DEFAULT_CATEGORY = "雅思托福";

/** IT 面试技术英语（与雅思托福 / 托业并列） */
export const EN_VOCAB_IT_INTERVIEW_CATEGORY = "IT面试";

/** 已知分类（UI 下拉；上传也可写自由文本） */
export const EN_VOCAB_CATEGORY_PRESETS = [
  EN_VOCAB_DEFAULT_CATEGORY,
  "托业",
  EN_VOCAB_IT_INTERVIEW_CATEGORY,
] as const;

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
  托业词汇: "托业",
  /** STT / 本地 API 常传「托业错题分类」→ 归入托业 */
  托业错题分类: "托业",
  托业错题: "托业",
  toeic: "托业",
  /** 雅思错题 → 雅思托福（与「雅思」别名一致） */
  雅思错题分类: EN_VOCAB_DEFAULT_CATEGORY,
  雅思错题: EN_VOCAB_DEFAULT_CATEGORY,
  /** IT 面试技术英语；STT 本地「IT面试类高频词汇」等别名 */
  IT面试: EN_VOCAB_IT_INTERVIEW_CATEGORY,
  "IT 面试": EN_VOCAB_IT_INTERVIEW_CATEGORY,
  IT面试类高频词汇: EN_VOCAB_IT_INTERVIEW_CATEGORY,
  IT面试类高频词汇类: EN_VOCAB_IT_INTERVIEW_CATEGORY,
  it面试: EN_VOCAB_IT_INTERVIEW_CATEGORY,
  "it interview": EN_VOCAB_IT_INTERVIEW_CATEGORY,
  it_interview: EN_VOCAB_IT_INTERVIEW_CATEGORY,
};

/**
 * 规范化分类：去空白；空 → 默认「雅思托福」；
 * 常见别名 +「类似分类」长名一律归入标准桶；其它自由文本原样保留。
 *
 * 对方 API 上传约定（防再出现独立「…错题分类」）：
 * - 名称含「托业」/ toeic →「托业」
 * - 名称含「雅思」/「托福」/ ielts / toefl →「雅思托福」
 * - 名称含「IT面试」→「IT面试」
 */
export function normalizeEnVocabCategory(raw?: string | null): string {
  const t = (raw || "").trim();
  if (!t) return EN_VOCAB_DEFAULT_CATEGORY;
  const mapped = CATEGORY_ALIASES[t.toLowerCase()] ?? CATEGORY_ALIASES[t];
  if (mapped) return mapped;
  const lower = t.toLowerCase();
  // IT 优先，避免「IT面试托业」等混写误归托业
  if (t.includes("IT面试") || lower.includes("it面试") || lower.includes("it interview")) {
    return EN_VOCAB_IT_INTERVIEW_CATEGORY;
  }
  // 含托业（含「托业错题分类」「托业词汇」等类似名）→ 托业
  if (t.includes("托业") || lower.includes("toeic")) return "托业";
  // 含雅思 / 托福（含「雅思错题分类」等类似名）→ 雅思托福
  if (
    t.includes("雅思") ||
    t.includes("托福") ||
    lower.includes("ielts") ||
    lower.includes("toefl")
  ) {
    return EN_VOCAB_DEFAULT_CATEGORY;
  }
  return t;
}

/** 列表展示：空则显示默认分类 */
export function displayEnVocabCategory(raw?: string | null): string {
  return normalizeEnVocabCategory(raw);
}

/**
 * 窄列 / iPad 用：至少两个字，方便一眼分辨教材类型（托福 / 托业 / 雅思 / IT…）。
 * 完整名仍用 displayEnVocabCategory + title。
 */
export function shortEnVocabCategoryLabel(raw?: string | null): string {
  const full = displayEnVocabCategory(raw);
  const key = full.trim().toLowerCase();

  if (key === "雅思托福" || key === "雅思托福单词") return "雅思";
  if (key === "托福" || key === "toefl") return "托福";
  if (key === "托业" || key === "toeic") return "托业";
  if (key === "雅思" || key === "ielts") return "雅思";
  if (
    key === "it面试" ||
    key === "it 面试" ||
    full === EN_VOCAB_IT_INTERVIEW_CATEGORY ||
    full.includes("IT面试")
  ) {
    return "面试";
  }

  const chars = Array.from(full);
  if (chars.length <= 2) return full || "—";
  return chars.slice(0, 2).join("");
}
