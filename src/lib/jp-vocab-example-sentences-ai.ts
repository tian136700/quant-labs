import "server-only";

import {
  isJpVocabExampleGlossLine,
  isJpVocabExampleJapaneseLine,
  parseJpVocabExampleSentenceItems,
  serializeJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";

/** AI 例句：汉字旁用半角括号标注读音，如 電車(でんしゃ) */
const KANJI_FURIGANA_RE = /[\u4E00-\u9FFF]\([ぁ-んァ-ンー]+\)/;

export type JpVocabExampleSentencesAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
};

export function buildJpVocabExampleSentencesAiPrompt(
  input: JpVocabExampleSentencesAiInput
): string {
  const kindLabel = input.kind === "grammar" ? "语法" : "单词";
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `读音：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    `类型：${kindLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请为上述日语${kindLabel}写 2 条例句，供 N5/N4 初学者复习朗读。

要求：
1. JLPT N5～N4 难度，日常口语、常用说法，句子短（每句约 8～18 字）。
2. 每条日语例句必须使用该词条（语法条则句型中要自然出现该语法点）。
3. 日语句里的汉字必须在汉字后立刻用半角括号标注假名读音，例如：電車(でんしゃ)に間(ま)に合(あ)いました。不要整句只写假名。
4. 每条日语例句的下一行写一行中文译义，必须以「译文：」开头（例如：译文：我赶上电车了。）。
5. 只输出 4 行：日语、译文、日语、译文。不要编号、不要 markdown、不要解释。`;
}

/** 校验 AI 返回的例句块是否可用 */
export function validateJpVocabExampleSentencesAiOutput(
  raw: string,
  input: JpVocabExampleSentencesAiInput
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

  const block = lines.slice(0, 4).join("\n");
  const items = parseJpVocabExampleSentenceItems(block);
  if (items.length < 2) {
    return { ok: false, reason: "need_two_japanese_lines" };
  }

  for (const item of items.slice(0, 2)) {
    if (!isJpVocabExampleJapaneseLine(item.text)) {
      return { ok: false, reason: "invalid_japanese_line" };
    }
    if (/[\u4E00-\u9FFF]/.test(item.text) && !KANJI_FURIGANA_RE.test(item.text)) {
      return { ok: false, reason: "missing_kanji_furigana" };
    }
    if (item.glossLines.length === 0 || !isJpVocabExampleGlossLine(item.glossLines[0])) {
      return { ok: false, reason: "missing_chinese_gloss" };
    }
  }

  const target = input.word.trim();
  const combined = items
    .slice(0, 2)
    .map((item) => item.text)
    .join("");
  const combinedPlain = combined.replace(/\([ぁ-んァ-ンー]+\)/g, "");
  if (input.kind === "grammar") {
    const core = target.replace(/^[～~〜]+/, "").replace(/[～~〜]+$/, "");
    if (core && !combinedPlain.includes(core) && !combinedPlain.includes(target)) {
      return { ok: false, reason: "grammar_not_used" };
    }
  } else {
    const plain = target.split("/")[0]?.trim() || target;
    if (
      !combinedPlain.includes(plain) &&
      !combinedPlain.includes(target) &&
      !combined.includes(plain)
    ) {
      return { ok: false, reason: "word_not_used" };
    }
  }

  return {
    ok: true,
    text: serializeJpVocabExampleSentenceItems(items.slice(0, 2)),
  };
}
