import "server-only";

import {
  isJpVocabExampleGlossLine,
  isJpVocabExampleJapaneseLine,
  jpVocabExampleHasInvalidFuriganaParen,
  jpVocabExampleHasUnannotatedKanji,
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
import {
  countJpVocabExampleSentenceTargetFromMeaning,
  splitJpVocabMeaningMajorSenses,
} from "@/lib/jp-vocab-meaning-ai";

/** 上传/本地模型须遵守的例句契约（与 compose 规则一致；list_missing 会原样返回） */
export const JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC = {
  version: 1,
  count_rule:
    "释义含 / 时：条数 = 斜杠段数（每段 1 句，须体现对应读音）；否则条数 = max(2, 段内 ； 近义数)",
  format_example:
    "電車(でんしゃ)に間(ま)に合(あ)いました。\n译文：我赶上电车了。\nもう少(すこ)し早(はや)く来(き)てください。\n译文：请再早一点来。",
  rules: [
    "存库不要写行首序号（展示层会加 1、2、3…）",
    "每条：日语一行，下一行必须以「译文：」开头的中文",
    "中文译文必须自然通顺（口语）；禁止逐词硬译（如「について話す」→「关于…说话」；应作「谈谈/聊聊…」）",
    "释义栏的「关于……」等只是义项提示，不要每句译文都机械套同一套壳",
    "句中每一个汉字都必须立刻半角括号假名（不能只标词条本身）：如 今日(きょう)は気分(きぶん)がいいです；词尾假名如 静か(しずか)、落(お)ち着(つ)き；括号内只能是假名、不要空格、不要整句读音尾注；禁止句末语法说明括号；页面展示会转成汉字下方小字",
    "N5～N4、口语、短句；必须自然用到该词条 / 语法点",
    "初学者友好：一句尽量只用一个话题助词「は」；时间/场景已用「今は」等时，主语改用「が」或省略，不要叠「今は傘は…」这类双は（语法虽对但 N5 易误判）",
    "语法词条里的「～」「〜」是占位符，禁止原样写进例句；要用具体词：天气预报によると／彼によると…",
    "语法助词（～が / ～は / ～を…）：句中必须出现该助词本身；教「が」时不要写成只有「は」的例句",
    "な形容词辞书形以「だ」结尾时（重要だ/得意だ/下手だ）：造句用词干（重要/得意/下手），例句里不必出现「だ」；假名标在词干汉字上",
    "多用法时一句对应一种用法，不要两句挤同一义项",
    "释义已含 / 时：按斜杠分段，每段造 1 句，且须体现该段读音（如 前 的 まえ/ぜん）",
    "写回时请传 source，建议「模型名/版本 本地|线上」，如「gemma4:26b 本地」；人手填写为「手动」",
  ],
  reject_reasons: [
    "empty",
    "need_four_lines",
    "need_two_japanese_lines",
    "need_more_japanese_lines",
    "invalid_japanese_line",
    "incomplete_kanji_furigana",
    "bad_furigana_paren",
    "missing_chinese_gloss",
    "literal_chinese_gloss",
    "lemma_placeholder_in_sentence",
    "grammar_not_used",
    "word_not_used",
    "double_wa_topic",
  ],
} as const;

/** 已知死译壳：关于X说话（「について話す」应为谈谈/聊聊） */
const LITERAL_NI_TSUITE_HANASU_GLOSS_RE = /关于.+说话/;

/** 词典占位符波浪号，禁止出现在例句正文 */
const LEMMA_PLACEHOLDER_WAVE_RE = /[～〜]/;

/** 句中话题助词「は」个数（剥括号假名后；不含 早(はや) 等括号内は） */
export function countJpVocabExampleWaTopicMarkers(line: string): number {
  const plain = stripAllJpVocabParenBlocks(line);
  return (plain.match(/[\u3040-\u9FFF\u4E00-\u9FFF]は/g) || []).length;
}

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

  const targetCount = countJpVocabExampleSentenceTargetFromMeaning(meaning, input.kind);
  const majorSenses = splitJpVocabMeaningMajorSenses(meaning || "");
  const countRuleHint =
    majorSenses.length >= 2
      ? `释义含 ${majorSenses.length} 个斜杠段 → 须造 ${targetCount} 句（每段 1 句，例句须体现对应读音）`
      : `须造 ${targetCount} 句（无斜杠时 max(2, 近义数)）`;

  return `${meta}

请为上述日语${kindLabel}写例句，供 N5/N4 初学者复习朗读。

条数规则（必须遵守）：
- ${countRuleHint}
- 先读「释义」：含半角斜杠 / 时，斜杠分隔不同读音/大义项，每段造 1 句。
- 无斜杠时：先判断有几种常用用法；每种用法 1 句；仅 1 种用法则造 2 句（换场景）。
- 多用法时一句对应一种用法，不要两句都挤同一义项。
- 例：词条 前，读音 まえ/ぜん，释义 前面；以前/前面的；预先的 → 2 句：第 1 句用 まえ（駅の前），第 2 句用 ぜん（前日）。
- 例：词条 中，读音 なか/ちゅう，释义 中间；里面/正在进行 → 2 句：第 1 句 なか（箱の中），第 2 句 ちゅう（会議中）。

格式要求：
1. JLPT N5～N4，日常口语，句子短（每句约 8～18 字）；优先简单、顺口的句式，避免初学者看了会怀疑写错的结构。
2. 每条必须使用该词条（语法条须自然出现该语法点）。な形容词「〜だ」用词干，不要硬塞「だ」。
3. 一句尽量只用一个话题助词「は」。时间/场景已用「今は」「今日は」等时，主语用「が」或省略，不要叠两个「は」。
   - ❌「今(いま)は傘(かさ)は不要(ふよう)だ。」（语法虽对，N5 易误判）→ ✅「今(いま)は傘(かさ)が不要(ふよう)です。」或「傘(かさ)は要(い)りません。」
4. 语法词条的「～」「〜」禁止出现在例句里（那是词典占位符）。❌「～によると天気は晴れです」✅「天気予報(てんきよほう)によると、今日(きょう)は晴(は)れです」。
5. 假名标注必须全覆盖：句中**每一个汉字**后立刻半角括号假名，不能只标词条本身。
   - ❌「今日は気分(きぶん)がいいです。」（「今日」漏标，页面下方无假名）
   - ✅「今日(きょう)は気分(きぶん)がいいです。」
   - ❌「友達と話すと、気分(きぶん)が良くなります。」（友達/話/良 漏标）
   - ✅「友達(ともだち)と話(はな)すと、気分(きぶん)が良(よ)くなります。」
   - 词尾假名也算 base：静か(しずか)、落(お)ち着(つ)きます
   - 禁止整句尾注如「です。(たなかさん げんき です。)」；禁止句末语法说明括号
6. 每条日语下一行写中文译义，必须以「译文：」开头。
7. 中文必须是自然通顺的口语，禁止逐词硬译。
   - 「～について話す」→「我来谈谈学校 / 聊聊这个话题」，禁止「关于学校说话」。
   - 「～について知りたい」→「想了解一下…」，不要「关于…想知道」。
   - 释义里的「关于……」只是语法义项提示，不要每句都机械套「关于…」。
8. 只输出「日语」行与下一行以「译文：」开头的中文交替；不要行首编号、不要 markdown、不要解释、不要额外语法说明。`;
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
  const targetCount = countJpVocabExampleSentenceTargetFromMeaning(
    input.meaning,
    input.kind
  );
  const minLines = Math.max(4, targetCount * 2);
  if (lines.length < minLines) {
    return { ok: false, reason: "need_four_lines" };
  }

  const items = parseJpVocabExampleSentenceItems(lines.join("\n"));
  if (items.length < targetCount) {
    return { ok: false, reason: "need_more_japanese_lines" };
  }
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
    if (jpVocabExampleHasUnannotatedKanji(item.text)) {
      return { ok: false, reason: "incomplete_kanji_furigana" };
    }
    if (item.glossLines.length === 0 || !isJpVocabExampleGlossLine(item.glossLines[0])) {
      return { ok: false, reason: "missing_chinese_gloss" };
    }
    const glossBody = item.glossLines[0].replace(/^(译文|翻譯|翻译|译|譯)\s*[:：]\s*/, "");
    if (LITERAL_NI_TSUITE_HANASU_GLOSS_RE.test(glossBody)) {
      return { ok: false, reason: "literal_chinese_gloss" };
    }
    if (
      input.kind !== "grammar" &&
      countJpVocabExampleWaTopicMarkers(item.text) >= 2
    ) {
      return { ok: false, reason: "double_wa_topic" };
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
