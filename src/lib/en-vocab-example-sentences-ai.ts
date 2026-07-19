import {
  isEnVocabExampleEnglishLine,
  isEnVocabExampleGlossLine,
  parseEnVocabExampleSentenceItems,
  serializeEnVocabExampleSentenceItems,
  stripEnVocabExampleGlossLabel,
} from "@/lib/en-vocab-example-sentences";

/** 上传/本地模型须遵守的英语例句契约 */
export const EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC = {
  version: 1,
  count_rule: "条数 = max(2, 用法数)；仅 1 种用法时造 2 句（同用法换场景）",
  format_example:
    "I look forward to the weekend.\n译文：我期待周末的到来。\nShe is looking forward to meeting you.\n译文：她期待见到你。",
  rules: [
    "存库不要写行首序号（展示层会加 1、2、3…）",
    "每条：英文一行，下一行必须以「译文：」开头的中文",
    "初中/高中难度、口语、短句；必须自然用到该词条 / 语法点",
    "多用法时一句对应一种用法，不要两句挤同一义项",
    "写回时请传 source，建议「gemma4:26b 本地」；人手填写为「手动」",
  ],
  reject_reasons: [
    "empty",
    "need_four_lines",
    "need_two_english_lines",
    "invalid_english_line",
    "missing_chinese_gloss",
    "word_not_used",
  ],
} as const;

export type EnVocabExampleSentencesAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
};

export function buildEnVocabExampleSentencesAiPrompt(
  input: EnVocabExampleSentencesAiInput
): string {
  const kindLabel = input.kind === "grammar" ? "语法" : "单词";
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const pos = input.pos?.trim();
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `音标：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    pos ? `词性：${pos}` : null,
    `类型：${kindLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请为上述英语${kindLabel}写例句，供初中/高中学习者复习。

条数规则（必须遵守）：
- 先判断该词条有几种常用用法（义项）。
- 每种用法造 1 句；若只有 1 种用法，则造 2 句（同用法换场景）。
- 两种用法 → 2 句；三种 → 3 句；以此类推（条数 = max(2, 用法数)）。
- 多用法时一句对应一种用法，不要两句都挤同一义项。

格式要求：
1. 日常口语，句子短；例句中其他词尽量简单常见。
2. 每条必须使用该词条（语法条须自然出现该语法点）。
3. 每条英文下一行写中文译义，必须以「译文：」开头。
4. 只输出「英文 / 译文：…」交替行；不要行首编号、不要 markdown、不要解释。`;
}

function wordUsedInEnglish(sentence: string, word: string, kind: string): boolean {
  const target = word.trim();
  if (!target) return false;
  if (kind === "grammar") {
    // 语法点可能是短语；宽松包含即可
    return sentence.toLowerCase().includes(target.toLowerCase().replace(/^～/, ""));
  }
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return re.test(sentence);
}

/** 校验 AI 返回的例句块是否可用 */
export function validateEnVocabExampleSentencesAiOutput(
  raw: string,
  input: EnVocabExampleSentencesAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 4) {
    return { ok: false, reason: "need_four_lines" };
  }

  const items = parseEnVocabExampleSentenceItems(lines.join("\n"));
  if (items.length < 2) {
    return { ok: false, reason: "need_two_english_lines" };
  }

  for (const item of items) {
    if (!isEnVocabExampleEnglishLine(item.text)) {
      return { ok: false, reason: "invalid_english_line" };
    }
    if (!item.gloss || !isEnVocabExampleGlossLine(item.gloss)) {
      return { ok: false, reason: "missing_chinese_gloss" };
    }
    if (!stripEnVocabExampleGlossLabel(item.gloss)) {
      return { ok: false, reason: "missing_chinese_gloss" };
    }
    if (!wordUsedInEnglish(item.text, input.word, input.kind)) {
      return { ok: false, reason: "word_not_used" };
    }
  }

  return {
    ok: true,
    text: serializeEnVocabExampleSentenceItems(items),
  };
}
