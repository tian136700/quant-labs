import "server-only";

import {
  isJpVocabExampleGlossLine,
  isJpVocabExampleJapaneseLine,
  parseJpVocabExampleSentenceItems,
  serializeJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";

/** AI 例句：汉字旁用半角括号标注读音，如 電車(でんしゃ) */
const KANJI_FURIGANA_RE = /[\u4E00-\u9FFF]\([ぁ-んァ-ンー]+\)/;

/** 上传/本地模型须遵守的例句契约（与 compose 规则一致；list_missing 会原样返回） */
export const JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC = {
  version: 1,
  count_rule: "条数 = max(2, 用法数)；仅 1 种用法时造 2 句（同用法换场景）",
  format_example:
    "電車(でんしゃ)に間(ま)に合(あ)いました。\n译文：我赶上电车了。\nもう少(すこ)し早(はや)く来(き)てください。\n译文：请再早一点来。",
  rules: [
    "存库不要写行首序号（展示层会加 1、2、3…）",
    "每条：日语一行，下一行必须以「译文：」开头的中文",
    "汉字后立刻半角括号假名：漢字(かな)；不要整句只写假名",
    "N5～N4、口语、短句；必须自然用到该词条 / 语法点",
    "多用法时一句对应一种用法，不要两句挤同一义项",
    "写回时请传 source，建议「模型名/版本 本地|线上」，如「gemma4:26b 本地」；人手填写为「手动」",
  ],
  reject_reasons: [
    "empty",
    "need_four_lines",
    "need_two_japanese_lines",
    "invalid_japanese_line",
    "missing_kanji_furigana",
    "missing_chinese_gloss",
    "grammar_not_used",
    "word_not_used",
  ],
} as const;

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

请为上述日语${kindLabel}写例句，供 N5/N4 初学者复习朗读。

条数规则（必须遵守）：
- 先判断该词条有几种常用用法（义项）。
- 每种用法造 1 句；若只有 1 种用法，则造 2 句（同用法换场景）。
- 两种用法 → 2 句；三种 → 3 句；以此类推（条数 = max(2, 用法数)）。
- 多用法时一句对应一种用法，不要两句都挤同一义项。

格式要求：
1. JLPT N5～N4，日常口语，句子短（每句约 8～18 字）。
2. 每条必须使用该词条（语法条须自然出现该语法点）。
3. 汉字后立刻半角括号假名，例如：電車(でんしゃ)に間(ま)に合(あ)いました。不要整句只写假名。
4. 每条日语下一行写中文译义，必须以「译文：」开头。
5. 只输出「日语 / 译文：…」交替行；不要行首编号、不要 markdown、不要解释。`;
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

  const items = parseJpVocabExampleSentenceItems(lines.join("\n"));
  if (items.length < 2) {
    return { ok: false, reason: "need_two_japanese_lines" };
  }

  for (const item of items) {
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
  const combined = items.map((item) => item.text).join("");
  const combinedPlain = combined.replace(/\([ぁ-んァ-ンー]+\)/g, "");
  if (input.kind === "grammar") {
    const core = target.replace(/^[～~〜]+/, "").replace(/[～~〜]+$/, "");
    if (core && !combinedPlain.includes(core) && !combinedPlain.includes(target)) {
      return { ok: false, reason: "grammar_not_used" };
    }
  } else {
    const alts = target.split("/").map((s) => s.trim()).filter(Boolean);
    const plain = alts[0] || target;
    const hit =
      combinedPlain.includes(plain) ||
      combinedPlain.includes(target) ||
      combined.includes(plain) ||
      alts.some((alt) => combinedPlain.includes(alt) || combined.includes(alt));
    if (!hit) {
      return { ok: false, reason: "word_not_used" };
    }
  }

  return {
    ok: true,
    text: serializeJpVocabExampleSentenceItems(items),
  };
}
