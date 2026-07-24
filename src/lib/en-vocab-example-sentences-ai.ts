import {
  assessEnVocabExampleEnglishSentence,
  enVocabLemmaAppearsInSentence,
  isEnVocabExampleEnglishLine,
  isEnVocabExampleGlossLine,
  parseEnVocabExampleSentenceItems,
  serializeEnVocabExampleSentenceItems,
  stripEnVocabExampleGlossLabel,
} from "@/lib/en-vocab-example-sentences";
import { parseEnVocabUsagePoints } from "@/lib/en-vocab-usage-ai";

/** 上传/本地模型须遵守的英语例句契约（须先有 usage；队列按用法槽一次一句） */
export const EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC = {
  version: 4,
  count_rule:
    "队列按用法槽：每个用法缺例句则入队；每次只造 1 句对应 1 条用法；存库仍按序号 1:1 配对",
  format_example:
    "I put the book above the shelf.\n译文：我把书放在架子上面。",
  rules: [
    "必须已有「用法」编号说明；list_missing 按用法槽检测（用法 N 下无合格例句 → 入队）",
    "每次 apply 只写回 1 句（带 usage_index），合并进该词 example_sentences 对应槽",
    "存库不要写行首序号（展示层会加 1、2、3…）",
    "每条：英文必须是完整句子（有主语谓语，句末 . ! ?），禁止只写单词或搭配短语",
    "每条：英文一行，下一行必须以「译文：」开头的中文（禁止「译文：/ …」）；译文须对应英文整句",
    "初中口语、短句；例句里其它词尽量用最常见的基础词（avoid / however / furthermore 等偏难词）",
    "写回时请传 source，建议「本地 gemma4:26b」；人手填写为「手动」",
  ],
  reject_reasons: [
    "empty",
    "usage_required",
    "usage_unparsed",
    "usage_index_required",
    "usage_index_invalid",
    "need_prior_example",
    "need_pair_lines",
    "wrong_example_count",
    "invalid_english_line",
    "missing_chinese_gloss",
    "word_not_used",
    "missing_sentence_final_punct",
    "english_not_sentence",
    "lemma_only_example",
    "english_phrase_not_sentence",
    "english_too_short_vs_gloss",
    "already_filled",
  ],
} as const;

export type EnVocabExampleSentencesAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
  /** 已存库的编号用法正文（必填才能造句） */
  usage?: string | null;
  /**
   * 1-based 用法槽。传入时只为该条用法造 1 句（队列模式）。
   * 省略时仍按全部用法条数造齐（兼容旧全量写回）。
   */
  usageIndex?: number | null;
};

/** 由 usage 解析应得例句条数；解析失败返回 null */
export function expectedEnVocabExampleCountFromUsage(
  usage: string | null | undefined
): number | null {
  const points = parseEnVocabUsagePoints(String(usage ?? ""));
  if (!points || points.length < 1) return null;
  return points.length;
}

export function buildEnVocabExampleSentencesAiPrompt(
  input: EnVocabExampleSentencesAiInput
): string {
  const kindLabel = input.kind === "grammar" ? "语法" : "单词";
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const pos = input.pos?.trim();
  const usage = input.usage?.trim() || "";
  const points = parseEnVocabUsagePoints(usage);
  const usageIndex =
    typeof input.usageIndex === "number" &&
    Number.isInteger(input.usageIndex) &&
    input.usageIndex > 0
      ? input.usageIndex
      : null;

  const singlePoint =
    usageIndex != null && points
      ? points.find((p) => p.n === usageIndex) ?? null
      : null;

  // 队列模式：一次只造一个用法对应的一句
  if (usageIndex != null && singlePoint) {
    const meta = [
      `词条：${input.word.trim()}`,
      reading ? `音标：${reading}` : null,
      meaning ? `释义：${meaning}` : null,
      pos ? `词性：${pos}` : null,
      `类型：${kindLabel}`,
      `目标用法编号：${usageIndex}`,
      `应写例句条数：1`,
    ]
      .filter(Boolean)
      .join("\n");

    return `${meta}

目标用法（只为下面这一条造 1 句，禁止写其它用法的例句）：
${singlePoint.n}. ${singlePoint.text}

请为上述英语${kindLabel}写 1 条例句，供初中学习者复习抽问。

条数规则（必须遵守）：
- 必须写恰好 1 句，且只体现上列用法 ${usageIndex}。
- 禁止另起义项；禁止一次输出多句。

用词与难度：
- 句子要短、好记；除目标词及其常用搭配外，其余只用最基础词（I / you / the / book / today / school）。
- 时态可变（过去/现在/进行/完成都可）；expect→expected、get→got/get out 等常见变形或短语都可以。
- 不要难词、不要长难从句、不要叠很多语法点；抽问焦点必须落在目标词这一条用法上。

格式要求：
1. 英文必须是完整句子：有主语和谓语，句末必须有句号 . 或 ! 或 ?。禁止只写单词、词条本身或搭配短语。
   错误示例（禁止）：issue
   错误示例（禁止）：issue a statement
   正确示例：The issue is hard today.
   正确示例：They will issue a statement soon.
2. 英文须出现目标词或其常见词形/搭配（可改时态；多词词条如 Present Perfect / get out 须写出该短语）。
3. 语法条同样须在句中自然出现该语法点对应的词条文字。
4. 英文下一行写中文译义，必须以「译文：」开头；「译文：」后直接写中文，禁止「译文：/ …」。中文必须翻译上面那一整句英文，禁止英文短语配中文整句。
5. 只输出英文行与下一行「译文：」+中文；不要行首编号、不要 markdown、不要解释。`;
  }

  const expectedCount = points?.length ?? 0;
  const usageBlock =
    points && points.length > 0
      ? points.map((p) => `${p.n}. ${p.text}`).join("\n")
      : usage || "（无）";

  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `音标：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    pos ? `词性：${pos}` : null,
    `类型：${kindLabel}`,
    `应写例句条数：${expectedCount}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

已确认的用法说明（必须严格按下列编号一一对应造句，禁止另起义项）：
${usageBlock}

请为上述英语${kindLabel}写例句，供初中学习者复习抽问（聚焦雅思/托福高频用法，但正文不要写考试名）。

条数规则（必须遵守）：
- 必须写恰好 ${expectedCount} 句（与用法条数相同）。
- 第 1 句只体现用法 1；第 2 句只体现用法 2；以此类推，一一对应。
- 禁止脱离上列用法自由发挥；禁止两句挤同一条用法。

用词与难度：
- 句子要短、好记；除目标词及其常用搭配外，其余只用最基础词（I / you / the / book / today / school）。
- 时态可变（过去/现在/进行/完成都可）；词形变化与常用短语（get out 等）都可以。
- 不要难词、不要长难从句、不要叠很多语法点；抽问焦点必须落在目标词这一条用法上。

格式要求：
1. 每条英文必须是完整句子：有主语和谓语，句末必须有句号 . 或 ! 或 ?。禁止只写单词、词条本身或搭配短语。
   错误示例（禁止）：issue
   错误示例（禁止）：issue a statement
   正确示例：The issue is hard today.
   正确示例：They will issue a statement soon.
2. 每条英文须出现目标词或其常见词形/搭配（可改时态；多词词条须写出该短语）。
3. 语法条同样须在句中自然出现该语法点对应的词条文字。
4. 每条英文下一行写中文译义，必须以「译文：」开头；「译文：」后直接写中文，禁止「译文：/ …」。中文必须翻译上面那一整句英文，禁止英文短语配中文整句。
5. 只输出英文行与下一行「译文：」+中文交替；不要行首编号、不要 markdown、不要解释。`;
}

/** 单条例句是否合格（完整句 + 译文 + 用到词条） */
export function validateEnVocabSingleExampleSentenceItem(
  item: { text: string; gloss: string },
  input: Pick<EnVocabExampleSentencesAiInput, "word" | "kind">
): { ok: true } | { ok: false; reason: string } {
  if (!isEnVocabExampleEnglishLine(item.text)) {
    return { ok: false, reason: "invalid_english_line" };
  }
  if (!item.gloss || !isEnVocabExampleGlossLine(item.gloss)) {
    return { ok: false, reason: "missing_chinese_gloss" };
  }
  if (!stripEnVocabExampleGlossLabel(item.gloss)) {
    return { ok: false, reason: "missing_chinese_gloss" };
  }
  const sentenceCheck = assessEnVocabExampleEnglishSentence(
    item.text,
    input.word,
    item.gloss
  );
  if (!sentenceCheck.ok) {
    return { ok: false, reason: sentenceCheck.reason };
  }
  if (!enVocabLemmaAppearsInSentence(item.text, input.word, input.kind)) {
    return { ok: false, reason: "word_not_used" };
  }
  return { ok: true };
}

/** 校验「一次一句」模型输出 */
export function validateEnVocabSingleExampleSentenceAiOutput(
  raw: string,
  input: Pick<EnVocabExampleSentencesAiInput, "word" | "kind">
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { ok: false, reason: "need_pair_lines" };
  }

  const items = parseEnVocabExampleSentenceItems(lines.join("\n"));
  if (items.length !== 1) {
    return { ok: false, reason: "wrong_example_count" };
  }

  const item = items[0];
  const checked = validateEnVocabSingleExampleSentenceItem(item, input);
  if (!checked.ok) return checked;

  return {
    ok: true,
    text: serializeEnVocabExampleSentenceItems([item]),
  };
}

/** 校验 AI 返回的例句块是否可用（全量：条数须与 usage 一致） */
export function validateEnVocabExampleSentencesAiOutput(
  raw: string,
  input: EnVocabExampleSentencesAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };

  const expectedCount = expectedEnVocabExampleCountFromUsage(input.usage);
  if (expectedCount == null) {
    const usageTrim = input.usage?.trim();
    return {
      ok: false,
      reason: usageTrim ? "usage_unparsed" : "usage_required",
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < expectedCount * 2) {
    return { ok: false, reason: "need_pair_lines" };
  }

  const items = parseEnVocabExampleSentenceItems(lines.join("\n"));
  if (items.length !== expectedCount) {
    return { ok: false, reason: "wrong_example_count" };
  }

  for (const item of items) {
    const checked = validateEnVocabSingleExampleSentenceItem(item, input);
    if (!checked.ok) return checked;
  }

  return {
    ok: true,
    text: serializeEnVocabExampleSentenceItems(items),
  };
}
