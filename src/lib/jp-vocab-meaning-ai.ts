import "server-only";

/** 释义上传契约（list_missing 会原样返回；与本地模型约定一致） */
export const JP_VOCAB_MEANING_UPLOAD_SPEC = {
  version: 1,
  max_senses: 3,
  max_major_senses: 3,
  /** 同读音/大义项下的近义 */
  sub_separator: "；",
  /** 不同读音/大义项（与 reading 字段斜杠段一一对应） */
  major_separator: "/",
  format_example: "前面；以前/前面的；预先的",
  format_example_reading: "まえ/ぜん",
  rules: [
    "只补「单词」缺释义（grammar 语法条不走此接口）",
    "一词多种常用读音（如 前=まえ/ぜん、中=なか/ちゅう）时：不同读音/大义项用半角斜杠 / 分隔，段数与 reading 字段一致",
    "同一大义项下的近义仍用中文分号 ；，不要用英文分号或顿号",
    "斜杠前是第一义（训读等），斜杠后是第二义（音读/构词等）；例：前 → 前面；以前/前面的；预先的",
    "不要编号、不要 markdown、不要整句解释、不要日语假名",
    "写回时请传 source，建议「模型名/版本 本地|线上」，如「gemma4:26b 本地」「Qwen3 线上」；人手为「手动」",
  ],
  source_examples: ["gemma4:26b 本地", "Qwen3 线上", "手动"],
  reject_reasons: [
    "empty",
    "too_long",
    "no_chinese",
    "too_many_senses",
    "too_many_major_senses",
    "has_markdown",
    "has_latin_only",
  ],
} as const;

export type JpVocabMeaningAiInput = {
  word: string;
  reading?: string | null;
  kind?: string;
  pos?: string | null;
};

export function buildJpVocabMeaningAiPrompt(input: JpVocabMeaningAiInput): string {
  const reading = input.reading?.trim();
  const pos = input.pos?.trim();
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `读音：${reading}` : null,
    pos ? `词性：${pos}` : null,
    "类型：单词",
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请为上述日语单词写中文释义，供 N5/N4 初学者复习。

规则（必须遵守）：
1. 若该词有多种常用读音（尤其单字词如 前=まえ/ぜん、中=なか/ちゅう），须用半角斜杠 / 分隔不同读音/大义项；斜杠段数须与「读音」字段一致（读音也写 まえ/ぜん 这种形式）
2. 同一大义项下的近义仍用中文分号 ； 连接，例如：前面；以前/前面的；预先的（第一义 まえ，第二义 ぜん）
3. 仅一种读音时：只写 1～3 个近义，用 ； 连接，不要加斜杠，例如：漂亮；干净
4. 简短口语化，不要例句、不要编号、不要 markdown、不要解释过程
5. 不要输出日语假名或英文（专有名词可保留常见中文译名）
6. 只输出一行释义正文`;
}

/** 按斜杠拆大义项（不同读音/用法）；无斜杠则整段为一义 */
export function splitJpVocabMeaningMajorSenses(meaning: string | null | undefined): string[] {
  const parts = String(meaning || "")
    .split(/[/／]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [];
}

/** 规范化单段近义：按 ；/;/,/、 拆开，去重，最多 3 个，再用 ； 拼接 */
function normalizeJpVocabMeaningSubSenses(raw: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const chunk of String(raw || "").split(/[;；、,，|｜]+/)) {
    const item = chunk.trim().replace(/^[\d]+[.、．)\]]\s*/, "").replace(/[。.]+$/, "");
    if (!item || seen.has(item)) continue;
    seen.add(item);
    parts.push(item);
    if (parts.length >= JP_VOCAB_MEANING_UPLOAD_SPEC.max_senses) break;
  }
  return parts.join(JP_VOCAB_MEANING_UPLOAD_SPEC.sub_separator);
}

/** 规范化：保留 / 大义项；段内用 ； 近义 */
export function normalizeJpVocabMeaningText(raw: string): string {
  const majorParts = String(raw || "")
    .split(/[/／]/)
    .map((chunk) => normalizeJpVocabMeaningSubSenses(chunk))
    .filter(Boolean);
  if (!majorParts.length) return "";
  return majorParts.join(JP_VOCAB_MEANING_UPLOAD_SPEC.major_separator);
}

const HAN_RE = /[\u4E00-\u9FFF]/;
const MARKDOWN_RE = /[`*_#\[\]|>]/;
const MEANING_MAX_LEN = 96;

export function validateJpVocabMeaningAiOutput(
  raw: string
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = normalizeJpVocabMeaningText(raw);
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MEANING_MAX_LEN) return { ok: false, reason: "too_long" };
  if (MARKDOWN_RE.test(text)) return { ok: false, reason: "has_markdown" };
  if (!HAN_RE.test(text)) return { ok: false, reason: "no_chinese" };
  const major = splitJpVocabMeaningMajorSenses(text);
  if (major.length > JP_VOCAB_MEANING_UPLOAD_SPEC.max_major_senses) {
    return { ok: false, reason: "too_many_major_senses" };
  }
  for (const segment of major) {
    const senses = segment
      .split(JP_VOCAB_MEANING_UPLOAD_SPEC.sub_separator)
      .filter(Boolean);
    if (senses.length > JP_VOCAB_MEANING_UPLOAD_SPEC.max_senses) {
      return { ok: false, reason: "too_many_senses" };
    }
  }
  return { ok: true, text };
}

/** 例句条数：释义含 / 时按大义项数；否则 max(2, 段内 ； 近义数) */
export function countJpVocabExampleSentenceTargetFromMeaning(
  meaning: string | null | undefined,
  kind: string
): number {
  if (kind === "grammar") return 2;
  const major = splitJpVocabMeaningMajorSenses(meaning || "");
  if (major.length >= 2) return major.length;
  if (major.length === 1) {
    const sub = major[0]
      .split(JP_VOCAB_MEANING_UPLOAD_SPEC.sub_separator)
      .filter(Boolean);
    return Math.max(2, sub.length);
  }
  return 2;
}
