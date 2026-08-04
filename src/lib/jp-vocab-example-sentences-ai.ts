import "server-only";

import {
  formatJpVocabExampleGlossLine,
  isJpVocabExampleGlossLine,
  isJpVocabExampleJapaneseLine,
  jpVocabExampleHasInvalidFuriganaParen,
  jpVocabExampleHasUnannotatedKanji,
  listJpVocabUnannotatedKanji,
  parseJpVocabExampleSentenceItems,
  sanitizeJpVocabExampleJapaneseLine,
  serializeJpVocabExampleSentenceItems,
  stripAllJpVocabParenBlocks,
} from "@/lib/jp-vocab-example-sentences";
import {
  JP_VOCAB_JUKUGO_FURIGANA_PROMPT_HINT,
  jpVocabExampleHasWrongJukugoFurigana,
} from "@/lib/jp-vocab-jukugo-furigana";
import {
  jpVocabExampleLemmaSurfaces,
  jpVocabNaAdjParts,
  jpVocabNaAdjReadingForStem,
} from "@/lib/jp-vocab-na-adj";
import {
  countJpVocabExampleSentenceTargetFromMeaning,
  splitJpVocabMeaningMajorSenses,
} from "@/lib/jp-vocab-meaning-ai";
import { countJpVocabUsagePoints, isJpVocabConjugationGrammar } from "@/lib/jp-vocab-usage-ai";
import {
  jpVocabConnectionPromptAppendix,
  splitJpVocabAiOutputConnectionSection,
} from "@/lib/jp-vocab-connection-ai";
import { validateJpVocabUsageExamplePairAlignment } from "@/lib/jp-vocab-usage-example-pair-align";

/** 例句「是否用到词条」：汉字写法 + 读音假名（貰う / もらう / もらっ… 都算用到）。 */
function lemmaSurfacesForExampleHit(
  word: string,
  reading?: string | null
): string[] {
  const out = [...jpVocabExampleLemmaSurfaces(word)];
  const seen = new Set(out);
  const push = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const part of String(reading || "").split("/")) {
    push(part);
    // 活用：もらった 不含完整「もらう」，但含词干「もら」
    if (part.length >= 3) {
      push(part.slice(0, -1));
    }
  }
  return out;
}

/** 上传/本地模型须遵守的例句契约（与 compose 规则一致；list_missing 会原样返回） */
export const JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC = {
  version: 3,
  count_rule:
    "单词：释义含 / 时条数=斜杠段数；无斜杠固定 2（；近义不是条数）。语法：多用法→条数=用法点数（1:1）；仅 1 种用法→固定 3 句，按接续不同类型各造（一类／二类／名词等）；须先有 usage。同一次输出末尾须有【接序】",
  format_example:
    "電車(でんしゃ)に間(ま)に合(あ)いました。\n译文：我赶上电车了。\nもう少(すこ)し早(はや)く来(き)てください。\n译文：请再早一点来。\n【接序】\n一类动词／辞书形（动词原形）：「書く」；ます形：「書きます」；て形：「書いて」",
  rules: [
    "存库不要写行首序号（展示层会加 1、2、3…）",
    "每条：日语一行，下一行必须以「译文：」开头的中文（「译文：」后直接中文，禁止「译文：/ …」「译文：訳文：…」或日文「訳文：」标签）",
    "中文译文必须自然通顺（口语）；禁止逐词硬译（如「について話す」→「关于…说话」；应作「谈谈…」或「聊聊…」）",
    "释义栏的「关于……」等只是义项提示，不要每句译文都机械套同一套壳",
    "句中每一个汉字都必须立刻半角括号假名（不能只标词条本身）：如 今日(きょう)は気分(きぶん)がいいです；词尾假名如 静か(しずか)、落(お)ち着(つ)き；括号内只能是假名、不要空格、不要整句读音尾注；禁止句末语法说明括号；页面展示会转成汉字下方小字",
    "N5～N4、口语、短句；必须自然用到该词条 / 语法点",
    "语法例句：多用法时第 N 句对应第 N 条用法；仅 1 种用法时造 3 句，分别覆盖接续里不同词类/形态（如一类形容词／二类形容词／名词），不要三句同一接续；只用简单词、不要叠更难的语法（避免多焦点）；有课数时勿超纲（标日初级勿写中级/N2 词）",
    "初学者友好：一句尽量只用一个话题助词「は」；时间/场景已用「今は」等时，主语改用「が」或省略，不要叠「今は傘は…」这类双は（语法虽对但 N5 易误判）",
    "语法词条里的「～」「〜」是占位符，禁止原样写进例句；要用具体词：天气预报によると／彼によると…",
    "语法助词（～が / ～は / ～を…）：句中必须出现该助词本身；教「が」时不要写成只有「は」的例句",
    "な形容词辞书形以「だ」结尾时（重要だ/得意だ/下手だ）：造句用词干（重要/得意/下手），例句里不必出现「だ」；假名标在词干汉字上",
    "多用法时一句对应一种用法，不要两句挤同一义项",
    "释义已含 / 时：按斜杠分段，每段造 1 句，且须体现该段读音（如 前 的 まえ/ぜん）",
    "从句连接后要加顿号「、」：❌「食べながらテレビを見る」✅「食べながら、テレビを見る」；「によると」同理（❌「によると今日は…」✅「によると、今日は…」）",
    "每条日语须以「。」「！」「？」或「…」结尾，禁止无句末标点或只写单词",
    "单词例句：句末标点后可标 JLPT 等级半角括号 (N5)/(N4)/(N3)，如「…しました。(N5)」；尽量 N5～N4 简单句",
    "同一次输出末尾必须有【接序】段（词类与活用／语法接续）；禁止另开定时任务只补接序；写回可另传 connection 字段",
    "写回时请传 source，建议「模型名/版本 本地|线上」，如「gemma4:26b 本地」；人手填写为「手动」",
  ],
  reject_reasons: [
    "empty",
    "need_four_lines",
    "need_more_lines",
    "need_two_japanese_lines",
    "need_more_japanese_lines",
    "invalid_japanese_line",
    "incomplete_kanji_furigana",
    "wrong_jukugo_furigana",
    "bad_furigana_paren",
    "missing_chinese_gloss",
    "literal_chinese_gloss",
    "gloss_not_chinese",
    "gloss_has_yakuwen_label",
    "lemma_placeholder_in_sentence",
    "grammar_not_used",
    "word_not_used",
    "double_wa_topic",
    "missing_clause_touten",
    "missing_sentence_final_punct",
    "usage_required",
    "pair_semantic_mismatch",
    "connection_required",
    "connection_invalid",
  ],
} as const;

/** 已知死译壳：关于X说话（「について話す」应为谈谈/聊聊） */
const LITERAL_NI_TSUITE_HANASU_GLOSS_RE = /关于.+说话/;

/** 词典占位符波浪号，禁止出现在例句正文 */
const LEMMA_PLACEHOLDER_WAVE_RE = /[～〜]/;

/**
 * 译文行不得夹日语假名 / 整句日语（曾出现「译文：雨なら傘を忘れた。(あいなら…)」）。
 * 允许极少量拉丁数字；假名 ≥2 即拒。
 */
export function jpVocabExampleGlossLooksNonChinese(glossBody: string): boolean {
  const body = String(glossBody || "").trim();
  if (!body) return true;
  const kana = body.match(/[\u3040-\u30FFー]/g) || [];
  if (kana.length >= 2) return true;
  // 「译文：」后直接是日语助词句（无汉字假名括注时的纯假名已在上一档）
  // 含「なら／です／ます」等常见日语尾巴且汉字较多 → 当把日语塞进译文
  if (
    /[\u4E00-\u9FFF]{2,}/.test(body) &&
    /(?:なら|です|ます|した|して|から|ので|ください)/.test(body)
  ) {
    return true;
  }
  return false;
}

/** 模型常叠写日文标签「訳文：」→「译文：訳文：…」；写回须拒，展示层另有 strip */
export function jpVocabExampleGlossHasYakuwenLabel(glossLine: string): boolean {
  const t = String(glossLine || "").trim();
  if (!t) return false;
  if (/訳文\s*[:：]/.test(t)) return true;
  if (/译文\s*[:：]\s*訳文/.test(t)) return true;
  if (/^(訳|譯)\s*[:：]/.test(t) && !/^译文\s*[:：]/.test(t)) return true;
  return false;
}

/**
 * 「ながら／によると」后还有内容却未加読点「、」
 * （初学者例句须断开从句，避免「食べながらテレビ」粘成一团）
 */
const CLAUSE_CONNECTOR_MISSING_TOUTEN_RE =
  /(?:ながら|によると)(?=[^\s、。\n])/;

/** 句末须为 。！？… */
const SENTENCE_FINAL_PUNCT_RE = /[。！？…]$/;

/** 句中话题助词「は」个数（剥括号假名后；不含 早(はや) 等括号内は） */
export function countJpVocabExampleWaTopicMarkers(line: string): number {
  const plain = stripAllJpVocabParenBlocks(line);
  return (plain.match(/[\u3040-\u9FFF\u4E00-\u9FFF]は/g) || []).length;
}

/** 「ながら／によると」后接续内容时缺読点「、」 */
export function jpVocabExampleMissingClauseTouten(line: string): boolean {
  return CLAUSE_CONNECTOR_MISSING_TOUTEN_RE.test(line);
}

/** 日语例句缺句末标点（。！？…） */
export function jpVocabExampleMissingSentenceFinalPunct(line: string): boolean {
  const plain = stripAllJpVocabParenBlocks(line).trim();
  if (!plain) return false;
  return !SENTENCE_FINAL_PUNCT_RE.test(plain);
}

export type JpVocabExampleSentencesAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
  /** 语法条：编号用法；驱动例句条数（单用法→3；多用法→1:1） */
  usage?: string | null;
  /** 教材课次（如「标日初级上册第23课」）；例句勿超纲 */
  course_label?: string | null;
  /** 接序：单用法时按不同接续类型各造一例 */
  connection?: string | null;
};

/** 例句目标条数：语法看 usage；单用法→3 句（覆盖不同接续类型）；多用法→1:1；变形课无 usage 时固定 2 */
export function expectedJpVocabExampleSentenceCount(
  input: Pick<
    JpVocabExampleSentencesAiInput,
    "kind" | "meaning" | "usage" | "word"
  >
): number {
  if (input.kind === "grammar") {
    const n = countJpVocabUsagePoints(input.usage);
    if (n === 1) return 3;
    if (n >= 2) return n;
    if (isJpVocabConjugationGrammar(input.word)) return 2;
    return 3;
  }
  return countJpVocabExampleSentenceTargetFromMeaning(input.meaning, input.kind);
}

export function buildJpVocabExampleSentencesAiPrompt(
  input: JpVocabExampleSentencesAiInput
): string {
  const kindLabel = input.kind === "grammar" ? "语法" : "单词";
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const usage = input.usage?.trim();
  const connection = input.connection?.trim();
  const courseLabel = input.course_label?.trim();
  const { stem, hasDa } = jpVocabNaAdjParts(input.word);
  const stemReading = jpVocabNaAdjReadingForStem(reading || "", hasDa);
  const grammarCore = input.word
    .trim()
    .replace(/^[～~〜]+/, "")
    .replace(/[～~〜]+$/, "");
  const usagePointCount = countJpVocabUsagePoints(usage);
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
    courseLabel
      ? `教材课次：${courseLabel}（例句难度对齐本课附近，禁止明显超纲：初级勿用中级专词／N2 难词）`
      : null,
    input.kind === "grammar" && usage ? `用法：\n${usage}` : null,
    input.kind === "grammar" && connection
      ? `接序（造句须覆盖不同接续类型）：\n${connection}`
      : null,
    input.kind !== "grammar" && meaning ? `释义：${meaning}` : null,
    `类型：${kindLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  const targetCount = expectedJpVocabExampleSentenceCount(input);
  const majorSenses = splitJpVocabMeaningMajorSenses(meaning || "");
  const countRuleHint =
    input.kind === "grammar"
      ? usagePointCount === 1
        ? `须造恰好 ${targetCount} 句：本语法只有 1 种用法，按接序里不同词类/形态各造一例（如一类形容词、二类形容词、名词等）；不足 3 种接续时仍造 3 句，换场景/词类，禁止三句同一接续`
        : `须造 ${targetCount} 句：与上方「用法」一一对应（第 1 句对应用法 1，第 2 句对应用法 2…）`
      : majorSenses.length >= 2
        ? `释义含 ${majorSenses.length} 个斜杠段 → 须造 ${targetCount} 句（每段 1 句，例句须体现对应读音）`
        : `须造 ${targetCount} 句（无斜杠时固定 2；释义里的 ； 只是近义，不要按近义数加句）`;

  const grammarSimplicity =
    input.kind === "grammar"
      ? `
简单句（语法必守，防多焦点）：
- 只用简单单词（N5～N4）；不要再塞另一个更难的语法点。
- 若需前后两句（如「あとで」），前后都用短句、简单词；不要后句突然变难。
- 焦点只有「本语法」本身；其余内容越短越好。`
      : "";

  return `${meta}

请为上述日语${kindLabel}写例句，供 N5/N4 初学者复习朗读。

条数规则（必须遵守）：
- ${countRuleHint}
${
  input.kind === "grammar"
    ? "- 多用法时一句对应一种用法，不要两句都挤同一义项。"
    : `- 先读「释义」：含半角斜杠 / 时，斜杠分隔不同读音/大义项，每段造 1 句。
- 无斜杠时：先判断有几种常用用法；每种用法 1 句；仅 1 种用法则造 2 句（换场景）。
- 多用法时一句对应一种用法，不要两句都挤同一义项。
- 例：词条 前，读音 まえ/ぜん，释义 前面；以前/前面的；预先的 → 2 句：第 1 句用 まえ（駅の前），第 2 句用 ぜん（前日）。
- 例：词条 中，读音 なか/ちゅう，释义 中间；里面/正在进行 → 2 句：第 1 句 なか（箱の中），第 2 句 ちゅう（会議中）。`
}${grammarSimplicity}

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
   - ❌「私の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。」（「私」漏标 → incomplete_kanji_furigana）
   - ✅「私(わたし)の趣味(しゅみ)は音楽(おんがく)を聴(き)くことです。」
   - 常见易漏汉字也要标：私(わたし)、今日(きょう)、何(なん)/何(なに)、人(ひと)、時(とき)
   - 词尾假名也算 base：静か(しずか)、落(お)ち着(つ)きます
   - 禁止整句尾注如「です。(たなかさん げんき です。)」；禁止句末语法说明括号
5b. ${JP_VOCAB_JUKUGO_FURIGANA_PROMPT_HINT}
6. 从句连接后必须加顿号「、」：
   - ❌「食(た)べながらテレビを見(み)る。」→ ✅「食(た)べながら、テレビを見(み)る。」
   - ❌「天気予報(てんきよほう)によると今日(きょう)は晴(は)れです。」→ ✅「…によると、今日(きょう)は…」
7. 每条日语必须以「。」「！」「？」或「…」结尾；可在句末标 JLPT 等级半角括号 (N5)/(N4)/(N3)，紧贴句末标点之后，如「…しました。(N5)」；不要写「JLPT」「能力考」字样。
8. 每条日语下一行写中文译义，必须以「译文：」开头。
9. 中文必须是自然通顺的口语，禁止逐词硬译。
   - 「～について話す」→「我来谈谈学校」或「聊聊这个话题」，禁止「关于学校说话」。
   - 「～について知りたい」→「想了解一下…」，不要「关于…想知道」。
   - 释义里的「关于……」只是语法义项提示，不要每句都机械套「关于…」。
10. 只输出「日语」行与下一行「译文：」+中文交替；「译文：」后直接写中文，禁止「译文：/ …」、日文「訳文：」叠标签或行首斜杠；不要行首编号、不要 markdown、不要解释、不要额外语法说明。
${
  input.kind === "grammar"
    ? ""
    : `11. 相关构词（助记，与例句等同一次输出，勿另开请求）：没有自然相关词就不要写（填空/省略即可，禁止硬凑）；只有 1～2 个就写 1～2；多则最多 4～5 行「漢字(かな)：中文｜词性」；【词性·必填】行末全角「｜」接名词/他动词/自动词/动词/い形容词/な形容词/副词等（例：迎え(むかえ)：迎接｜名词；出迎える(でむかえる)：出去迎接｜他动词）；须含本词汉字；单汉字须同读（允许连浊くち→ぐち、こと→ごと；禁止不同音读，如事=こと勿写食事/大事的「じ」）；多字词先拆部件再举同旁词（会社員→会社(かいしゃ)：公司｜名词、店員(てんいん)：店员｜名词）；【禁止本词】不要把词条本身再写进相关构词（研修生≠再写研修生）；一词多义用中文逗号「，」（目上：上级，长辈｜名词），释义里禁止用「；」；优先 N5～N4（口→入口(いりぐち)：入口｜名词）；假名须正确；禁止商务难词。`
}
${jpVocabConnectionPromptAppendix(input.kind === "grammar" ? "grammar" : "word")}`;
}

/** 校验 AI 返回的例句块是否可用 */
export function validateJpVocabExampleSentencesAiOutput(
  raw: string,
  input: JpVocabExampleSentencesAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  // 接序段不参与例句行数校验；调用方应先 split 出 connection
  const split = splitJpVocabAiOutputConnectionSection(String(raw ?? ""));
  const text = split.body.trim();
  if (!text) return { ok: false, reason: "empty" };

  if (input.kind === "grammar" && countJpVocabUsagePoints(input.usage) < 1) {
    if (!isJpVocabConjugationGrammar(input.word)) {
      return { ok: false, reason: "usage_required" };
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const targetCount = expectedJpVocabExampleSentenceCount(input);
  const isConj =
    input.kind === "grammar" && isJpVocabConjugationGrammar(input.word);
  const minLines = isConj
    ? 4
    : input.kind === "grammar"
      ? Math.max(2, targetCount * 2)
      : Math.max(4, targetCount * 2);
  if (lines.length < minLines) {
    // 历史原因码 need_four_lines（单词下限 4 行=2 句）；条数>2 时用更准的名字
    return {
      ok: false,
      reason: minLines <= 4 ? "need_four_lines" : "need_more_lines",
    };
  }

  const items = parseJpVocabExampleSentenceItems(lines.join("\n"));
  if (items.length < targetCount) {
    return { ok: false, reason: "need_more_japanese_lines" };
  }
  const cappedItems =
    isConj && items.length > 3 ? items.slice(0, 3) : items;
  if (input.kind !== "grammar" && cappedItems.length < 2) {
    return { ok: false, reason: "need_two_japanese_lines" };
  }

  const cleanedItems = cappedItems.map((item) => ({
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
      const missing = listJpVocabUnannotatedKanji(item.text);
      const suffix = missing.length > 0 ? `:${missing.join("")}` : "";
      return { ok: false, reason: `incomplete_kanji_furigana${suffix}` };
    }
    if (jpVocabExampleHasWrongJukugoFurigana(item.text)) {
      return { ok: false, reason: "wrong_jukugo_furigana" };
    }
    if (item.glossLines.length === 0 || !isJpVocabExampleGlossLine(item.glossLines[0])) {
      return { ok: false, reason: "missing_chinese_gloss" };
    }
    if (jpVocabExampleGlossHasYakuwenLabel(item.glossLines[0])) {
      return { ok: false, reason: "gloss_has_yakuwen_label" };
    }
    const glossBody = item.glossLines[0].replace(/^(译文|翻譯|翻译|译|譯)\s*[:：]\s*/, "");
    if (LITERAL_NI_TSUITE_HANASU_GLOSS_RE.test(glossBody)) {
      return { ok: false, reason: "literal_chinese_gloss" };
    }
    if (jpVocabExampleGlossLooksNonChinese(glossBody)) {
      return { ok: false, reason: "gloss_not_chinese" };
    }
    if (
      input.kind !== "grammar" &&
      countJpVocabExampleWaTopicMarkers(item.text) >= 2
    ) {
      return { ok: false, reason: "double_wa_topic" };
    }
    if (jpVocabExampleMissingClauseTouten(item.text)) {
      return { ok: false, reason: "missing_clause_touten" };
    }
    if (jpVocabExampleMissingSentenceFinalPunct(item.text)) {
      return { ok: false, reason: "missing_sentence_final_punct" };
    }
  }

  const target = input.word.trim();
  const combined = cleanedItems.map((item) => item.text).join("");
  // 语法点检测：去掉全部括号，避免尾注里的「が」误判
  const combinedPlain = stripAllJpVocabParenBlocks(combined);
  if (input.kind === "grammar") {
    const core = target.replace(/^[～~〜]+/, "").replace(/[～~〜]+$/, "");
    const allKana = core.match(/[\u3040-\u30FFー]+/g) || [];
    const longKana = allKana
      .filter((run) => run.length >= 2)
      .sort((a, b) => b.length - a.length);
    if (longKana.length > 0) {
      // ～ておく / ～てみる：须出现假名语法核或其词干（ておきました→ておき）
      const variants = longKana.flatMap((n) => {
        const out = [n];
        if (n.length >= 3) out.push(n.slice(0, -1));
        return out;
      });
      const hit = variants.some(
        (n) => combinedPlain.includes(n) || combined.includes(n)
      );
      if (!hit) {
        return { ok: false, reason: "grammar_not_used" };
      }
    } else if (core && !/[\u4E00-\u9FFF]/.test(core)) {
      // ～が / ～を：纯短助词
      if (!combinedPlain.includes(core) && !combinedPlain.includes(target)) {
        return { ok: false, reason: "grammar_not_used" };
      }
    }
    // 「て形变形」等中文教学标题：不硬卡全文出现
  } else {
    const surfaces = lemmaSurfacesForExampleHit(target, input.reading);
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

  if (input.kind === "grammar" && !isConj) {
    const align = validateJpVocabUsageExamplePairAlignment({
      word: target,
      kind: "grammar",
      usage: input.usage,
      example_sentences: serializeJpVocabExampleSentenceItems(cleanedItems),
    });
    if (!align.ok) return { ok: false, reason: align.reason };
  }

  return {
    ok: true,
    text: serializeJpVocabExampleSentenceItems(cleanedItems),
  };
}

/**
 * 线上付费 batch 写回：sanitize + 保留 JLPT (N5) 尾标。
 * **必须**拒漏标汉字 / 非法括注（与本地 STT 同级）；曾因放行导致页面汉字无下方假名。
 * 缺顿号等其它本地细则仍可略宽；完整校验走 validateJpVocabExampleSentencesAiOutput。
 */
export function normalizeJpVocabExampleSentencesForOnlineApply(
  raw: string,
  input: JpVocabExampleSentencesAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  const split = splitJpVocabAiOutputConnectionSection(String(raw ?? ""));
  const text = split.body.trim();
  if (!text) return { ok: false, reason: "empty" };

  const items = parseJpVocabExampleSentenceItems(text)
    .map((item) => ({
      text: sanitizeJpVocabExampleJapaneseLine(item.text),
      glossLines: item.glossLines
        .map((g) => formatJpVocabExampleGlossLine(g))
        .filter(Boolean),
    }))
    .filter((item) => item.text.trim());

  if (items.length < 1) {
    return { ok: false, reason: "need_japanese_lines" };
  }
  if (input.kind !== "grammar" && items.length < 2) {
    return { ok: false, reason: "need_two_japanese_lines" };
  }

  // 「訳文：」已由 formatJpVocabExampleGlossLine 剥成「译文：」；
  // 付费 batch 写库前 salvage，勿因标签字面拒掉可用例句（Mac 脚本亦会先 normalize）。
  // 严格 validate 路径仍拒原始「訳文：」，逼本地模型别叠日文标签。

  for (const item of items) {
    if (!item.text || !isJpVocabExampleJapaneseLine(item.text)) {
      return { ok: false, reason: "invalid_japanese_line" };
    }
    if (
      LEMMA_PLACEHOLDER_WAVE_RE.test(stripAllJpVocabParenBlocks(item.text))
    ) {
      return { ok: false, reason: "lemma_placeholder_in_sentence" };
    }
    if (jpVocabExampleHasInvalidFuriganaParen(item.text)) {
      return { ok: false, reason: "bad_furigana_paren" };
    }
    if (jpVocabExampleHasUnannotatedKanji(item.text)) {
      const missing = listJpVocabUnannotatedKanji(item.text);
      const suffix = missing.length > 0 ? `:${missing.join("")}` : "";
      return { ok: false, reason: `incomplete_kanji_furigana${suffix}` };
    }
    if (jpVocabExampleHasWrongJukugoFurigana(item.text)) {
      return { ok: false, reason: "wrong_jukugo_furigana" };
    }
    if (item.glossLines.length === 0) {
      return { ok: false, reason: "missing_chinese_gloss" };
    }
    // format 后应为「译文：…」；若仍检出日文标签则异常
    if (jpVocabExampleGlossHasYakuwenLabel(item.glossLines[0])) {
      return { ok: false, reason: "gloss_has_yakuwen_label" };
    }
    const glossBody = item.glossLines[0].replace(
      /^(译文|翻譯|翻译|译|譯)\s*[:：]\s*/,
      ""
    );
    if (LITERAL_NI_TSUITE_HANASU_GLOSS_RE.test(glossBody)) {
      return { ok: false, reason: "literal_chinese_gloss" };
    }
    if (jpVocabExampleGlossLooksNonChinese(glossBody)) {
      return { ok: false, reason: "gloss_not_chinese" };
    }
  }

  if (input.kind !== "grammar") {
    const target = input.word.trim();
    const combined = items.map((item) => item.text).join("");
    const combinedPlain = stripAllJpVocabParenBlocks(combined);
    const surfaces = lemmaSurfacesForExampleHit(target, input.reading);
    const hit = surfaces.some(
      (s) => combinedPlain.includes(s) || combined.includes(s)
    );
    if (!hit) {
      const { stem } = jpVocabNaAdjParts(target);
      const kans = (stem.match(/[\u4E00-\u9FFF]/g) || []).join("");
      if (
        !(kans && (combinedPlain.includes(kans) || combinedPlain.includes(kans[0]!)))
      ) {
        return { ok: false, reason: "word_not_used" };
      }
    }
  }

  return {
    ok: true,
    text: serializeJpVocabExampleSentenceItems(items),
  };
}
