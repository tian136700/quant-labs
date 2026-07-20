import "server-only";

/** 释义上传契约（list_missing 会原样返回；与本地模型约定一致） */
export const JP_VOCAB_MEANING_UPLOAD_SPEC = {
  version: 1,
  max_senses: 3,
  separator: "；",
  format_example: "休息；假期",
  rules: [
    "只补「单词」缺释义（grammar 语法条不走此接口）",
    "中文释义；一词多义时只写最常用的 1～3 个义项",
    "义项之间用中文分号「；」分隔，不要用英文分号或顿号",
    "不要编号、不要 markdown、不要整句解释、不要日语假名",
    "写回时请传 source，建议「模型名/版本 本地|线上」，如「gemma4:26b 本地」「Qwen3 线上」；人手为「手动」",
  ],
  source_examples: ["gemma4:26b 本地", "Qwen3 线上", "手动"],
  reject_reasons: [
    "empty",
    "too_long",
    "no_chinese",
    "too_many_senses",
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
1. 只写最常用的 1～3 个义项；多义用中文分号「；」连接，例如：漂亮；干净
2. 简短口语化，不要例句、不要编号、不要 markdown、不要解释过程
3. 不要输出日语假名或英文（专有名词可保留常见中文译名）
4. 只输出一行释义正文`;
}

const HAN_RE = /[\u4E00-\u9FFF]/;
const MARKDOWN_RE = /[`*_#\[\]|>]/;
const MEANING_MAX_LEN = 80;

/** 规范化：按 ；/;/,/、/／ 拆开，去重，最多 3 义，再用 ； 拼接 */
export function normalizeJpVocabMeaningText(raw: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const chunk of String(raw || "").split(/[;；、,，/／|｜]+/)) {
    const item = chunk.trim().replace(/^[\d]+[.、．)\]]\s*/, "").replace(/[。.]+$/, "");
    if (!item || seen.has(item)) continue;
    seen.add(item);
    parts.push(item);
    if (parts.length >= JP_VOCAB_MEANING_UPLOAD_SPEC.max_senses) break;
  }
  return parts.join(JP_VOCAB_MEANING_UPLOAD_SPEC.separator);
}

export function validateJpVocabMeaningAiOutput(
  raw: string
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = normalizeJpVocabMeaningText(raw);
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MEANING_MAX_LEN) return { ok: false, reason: "too_long" };
  if (MARKDOWN_RE.test(text)) return { ok: false, reason: "has_markdown" };
  if (!HAN_RE.test(text)) return { ok: false, reason: "no_chinese" };
  const senses = text.split(JP_VOCAB_MEANING_UPLOAD_SPEC.separator).filter(Boolean);
  if (senses.length > JP_VOCAB_MEANING_UPLOAD_SPEC.max_senses) {
    return { ok: false, reason: "too_many_senses" };
  }
  return { ok: true, text };
}
