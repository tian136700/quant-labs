/**
 * 英语词条 / 新课分类标签。
 * 存库用中文展示名；上传可传别名（IELTS/TOEFL、ielts_toefl 等）。
 *
 * 约定：local-upload / upload 传入的 category 经规范化后写入词条；
 * 未知分类保留原文（不再要求先改 PRESETS）。UI 下拉 = 预设 ∪ 库内已出现的分类。
 */

/** 默认分类：现有线上词条均属雅思托福 */
export const EN_VOCAB_DEFAULT_CATEGORY = "雅思托福";

/** IT 面试技术英语（与雅思托福 / 托业并列） */
export const EN_VOCAB_IT_INTERVIEW_CATEGORY = "IT面试";

/** F-1 学生签证面试英语 */
export const EN_VOCAB_F1_VISA_CATEGORY = "F1学生签证面试";

/** 已知分类（UI 建议；上传也可写自由文本，会原样入库） */
export const EN_VOCAB_CATEGORY_PRESETS = [
  EN_VOCAB_DEFAULT_CATEGORY,
  "托业",
  EN_VOCAB_IT_INTERVIEW_CATEGORY,
  "考驾照",
  "美甲师",
  EN_VOCAB_F1_VISA_CATEGORY,
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
  考驾照: "考驾照",
  驾照: "考驾照",
  driving: "考驾照",
  driving_license: "考驾照",
  美甲师: "美甲师",
  美甲: "美甲师",
  nail: "美甲师",
  nail_technician: "美甲师",
  F1学生签证面试: EN_VOCAB_F1_VISA_CATEGORY,
  "F-1学生签证面试": EN_VOCAB_F1_VISA_CATEGORY,
  F1签证面试: EN_VOCAB_F1_VISA_CATEGORY,
  "F-1签证面试": EN_VOCAB_F1_VISA_CATEGORY,
  "f1 visa interview": EN_VOCAB_F1_VISA_CATEGORY,
  "f-1 visa interview": EN_VOCAB_F1_VISA_CATEGORY,
  f1_visa_interview: EN_VOCAB_F1_VISA_CATEGORY,
};

/**
 * 规范化分类：去空白；空 → 默认「雅思托福」；
 * 常见别名 +「类似分类」长名一律归入标准桶；其它自由文本原样保留。
 *
 * 对方 API 上传约定（防再出现独立「…错题分类」）：
 * - 名称含「托业」/ toeic →「托业」
 * - 名称含「雅思」/「托福」/ ielts / toefl →「雅思托福」
 * - 名称含「IT面试」→「IT面试」
 * - 名称含 F1/F-1 + 签证，或「签证面试」→「F1学生签证面试」
 * - 其它新分类：原样入库（STT 上传时带 category 即可，无需先改本文件 PRESETS）
 */
export function normalizeEnVocabCategory(raw?: string | null): string {
  const t = (raw || "").trim();
  if (!t) return EN_VOCAB_DEFAULT_CATEGORY;
  const mapped = CATEGORY_ALIASES[t.toLowerCase()] ?? CATEGORY_ALIASES[t];
  if (mapped) return mapped;
  const lower = t.toLowerCase();
  // F1 / 签证面试优先于笼统「面试」，避免误归 IT面试
  if (
    t.includes("签证面试") ||
    t.includes("学生签证") ||
    ((t.includes("F1") || t.includes("F-1") || lower.includes("f1") || lower.includes("f-1")) &&
      (t.includes("签证") || lower.includes("visa")))
  ) {
    return EN_VOCAB_F1_VISA_CATEGORY;
  }
  // IT 优先，避免「IT面试托业」等混写误归托业
  if (t.includes("IT面试") || lower.includes("it面试") || lower.includes("it interview")) {
    return EN_VOCAB_IT_INTERVIEW_CATEGORY;
  }
  if (t.includes("美甲") || lower.includes("nail")) return "美甲师";
  if (t.includes("驾照") || lower.includes("driving")) return "考驾照";
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
 * 合并预设与库内已出现的分类（去重、规范化），供上传后自动出现在下拉。
 */
export function mergeEnVocabCategoryOptions(
  extraFromDb: readonly (string | null | undefined)[] = []
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...EN_VOCAB_CATEGORY_PRESETS, ...extraFromDb]) {
    const cat = normalizeEnVocabCategory(raw);
    if (!cat || seen.has(cat)) continue;
    seen.add(cat);
    out.push(cat);
  }
  return out;
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
  if (
    full === EN_VOCAB_F1_VISA_CATEGORY ||
    full.includes("签证面试") ||
    full.includes("学生签证")
  ) {
    return "签证";
  }
  if (full.includes("美甲")) return "美甲";
  if (full.includes("驾照")) return "驾照";

  const chars = Array.from(full);
  if (chars.length <= 2) return full || "—";
  return chars.slice(0, 2).join("");
}
