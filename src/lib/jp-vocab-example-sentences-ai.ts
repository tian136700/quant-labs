import "server-only";

import {
  isJpVocabExampleGlossLine,
  isJpVocabExampleJapaneseLine,
  jpVocabExampleHasInvalidFuriganaParen,
  parseJpVocabExampleSentenceItems,
  sanitizeJpVocabExampleJapaneseLine,
  serializeJpVocabExampleSentenceItems,
  stripAllJpVocabParenBlocks,
} from "@/lib/jp-vocab-example-sentences";
import {
  jpVocabExampleLemmaSurfaces,
  jpVocabNaAdjParts,
  jpVocabNaAdjReadingForStem,
} from "@/lib/jp-vocab-na-adj";

/** AI 例句：汉字（可带词尾假名）旁括号标注读音，如 電車(でんしゃ)、静か(しずか) */
const KANJI_FURIGANA_RE =
  /[\u4E00-\u9FFF][ぁ-んァ-ンヴヵヶー]*[（(][ぁ-んァ-ンー]+[）)]/;

/** 上传/本地模型须遵守的例句契约（与 compose 规则一致；list_missing 会原样返回） */
export const JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC = {
  version: 1,
  count_rule: "条数 = max(2, 用法数)；仅 1 种用法时造 2 句（同用法换场景）",
  format_example:
    "電車(でんしゃ)に間(ま)に合(あ)いました。\n译文：我赶上电车了。\nもう少(すこ)し早(はや)く来(き)てください。\n译文：请再早一点来。",
  rules: [
    "存库不要写行首序号（展示层会加 1、2、3…）",
    "每条：日语一行，下一行必须以「译文：」开头的中文",
    "中文译文必须自然通顺（口语）；禁止逐词硬译（如「について話す」→「关于…说话」；应作「谈谈/聊聊…」）",
    "释义栏的「关于……」等只是义项提示，不要每句译文都机械套同一套壳",
    "汉字（可带词尾假名）后立刻半角括号假名：如 電車(でんしゃ)、静か(しずか)；括号内只能是假名、不要空格、不要整句读音尾注如 です。(たなかさん…)；禁止句末语法说明括号如 (必要なは必要だ…の形です)；页面展示会转成汉字下方小字",
    "N5～N4、口语、短句；必须自然用到该词条 / 语法点",
    "语法词条里的「～」「〜」是占位符，禁止原样写进例句；要用具体词：天气预报によると／彼によると…",
    "语法助词（～が / ～は / ～を…）：句中必须出现该助词本身；教「が」时不要写成只有「は」的例句",
    "な形容词辞书形以「だ」结尾时（重要だ/得意だ/下手だ）：造句用词干（重要/得意/下手），例句里不必出现「だ」；假名标在词干汉字上",
    "多用法时一句对应一种用法，不要两句挤同一义项",
    "写回时请传 source，建议「模型名/版本 本地|线上」，如「gemma4:26b 本地」；人手填写为「手动」",
  ],
  reject_reasons: [
    "empty",
    "need_four_lines",
    "need_two_japanese_lines",
    "invalid_japanese_line",
    "missing_kanji_furigana",
    "bad_furigana_paren",
    "missing_chinese_gloss",
    "literal_chinese_gloss",
    "lemma_placeholder_in_sentence",
    "grammar_not_used",
    "word_not_used",
  ],
} as const;

/** 已知死译壳：关于X说话（「について話す」应为谈谈/聊聊） */
const LITERAL_NI_TSUITE_HANASU_GLOSS_RE = /关于.+说话/;

/** 词典占位符波浪号，禁止出现在例句正文 */
const LEMMA_PLACEHOLDER_WAVE_RE = /[～〜]/;

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
  const { stem, hasDa } = jpVocabNaAdjParts(input.word);
  const stemReading = jpVocabNaAdjReadingForStem(reading || "", hasDa);
  const grammarCore = input.word
    .trim()
    .replace(/^[～~〜]+/, "")
    .replace(/[～~〜]+$/, "");
  const meta = [
    `词条：${input.word.trim()}`,
    input.kind === "grammar" && grammarCore
      ? `语法点：句中必须出现「${grammarCore}」（教助词时不要换成别的助词；例如「～が」不要写成只有「は」的句子）。词条里的「～」「〜」是占位符，禁止写进例句；请换成具体内容，如「天気予報によると…」「彼によると…」`
      : null,
    hasDa
      ? `造句用词干：${stem}（「だ」是な形容词辞书形词尾，例句里用「${stem}」即可，不必带「だ」）`
      : null,
    reading ? `读音：${reading}` : null,
    hasDa && stemReading
      ? `词干假名：${stemReading}（标在「${stem}」上，写成 ${stem}(${stemReading})）`
      : null,
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
2. 每条必须使用该词条（语法条须自然出现该语法点）。な形容词「〜だ」用词干，不要硬塞「だ」。
3. 语法词条的「～」「〜」禁止出现在例句里（那是词典占位符）。❌「～によると天気は晴れです」✅「天気予報によると、今日は晴れです」。
4. 汉字后立刻半角括号假名，例如：電車(でんしゃ)。禁止整句尾注如「です。(たなかさん げんき です。)」；禁止句末再跟语法说明括号如「。(必要なは必要だ(ひつようだ)の形容動詞形です)」。
5. 每条日语下一行写中文译义，必须以「译文：」开头。
6. 中文必须是自然通顺的口语，禁止逐词硬译。
   - 「～について話す」→「我来谈谈学校 / 聊聊这个话题」，禁止「关于学校说话」。
   - 「～について知りたい」→「想了解一下…」，不要「关于…想知道」。
   - 释义里的「关于……」只是语法义项提示，不要每句都机械套「关于…」。
7. 只输出「日语」行与下一行以「译文：」开头的中文交替；不要行首编号、不要 markdown、不要解释、不要额外语法说明。`;
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

  const cleanedItems = items.map((item) => ({
    ...item,
    text: sanitizeJpVocabExampleJapaneseLine(item.text),
  }));

  for (const item of cleanedItems) {
    if (!item.text || !isJpVocabExampleJapaneseLine(item.text)) {
      return { ok: false, reason: "invalid_japanese_line" };
    }
    if (LEMMA_PLACEHOLDER_WAVE_RE.test(stripAllJpVocabParenBlocks(item.text))) {
      return { ok: false, reason: "lemma_placeholder_in_sentence" };
    }
    if (jpVocabExampleHasInvalidFuriganaParen(item.text)) {
      return { ok: false, reason: "bad_furigana_paren" };
    }
    if (/[\u4E00-\u9FFF]/.test(item.text) && !KANJI_FURIGANA_RE.test(item.text)) {
      return { ok: false, reason: "missing_kanji_furigana" };
    }
    if (item.glossLines.length === 0 || !isJpVocabExampleGlossLine(item.glossLines[0])) {
      return { ok: false, reason: "missing_chinese_gloss" };
    }
    const glossBody = item.glossLines[0].replace(/^(译文|翻譯|翻译|译|譯)\s*[:：]\s*/, "");
    if (LITERAL_NI_TSUITE_HANASU_GLOSS_RE.test(glossBody)) {
      return { ok: false, reason: "literal_chinese_gloss" };
    }
  }

  const target = input.word.trim();
  const combined = cleanedItems.map((item) => item.text).join("");
  // 语法点检测：去掉全部括号，避免尾注里的「が」误判
  const combinedPlain = stripAllJpVocabParenBlocks(combined);
  if (input.kind === "grammar") {
    const core = target.replace(/^[～~〜]+/, "").replace(/[～~〜]+$/, "");
    if (core && !combinedPlain.includes(core) && !combinedPlain.includes(target)) {
      return { ok: false, reason: "grammar_not_used" };
    }
  } else {
    const surfaces = jpVocabExampleLemmaSurfaces(target);
    const hit = surfaces.some(
      (s) => combinedPlain.includes(s) || combined.includes(s)
    );
    if (!hit) {
      const { stem } = jpVocabNaAdjParts(target);
      const kans = (stem.match(/[\u4E00-\u9FFF]/g) || []).join("");
      if (!(kans && (combinedPlain.includes(kans) || combinedPlain.includes(kans[0]!)))) {
        return { ok: false, reason: "word_not_used" };
      }
    }
  }

  return {
    ok: true,
    text: serializeJpVocabExampleSentenceItems(cleanedItems),
  };
}
