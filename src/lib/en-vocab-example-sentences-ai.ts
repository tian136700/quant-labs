import {
  isEnVocabExampleEnglishLine,
  isEnVocabExampleGlossLine,
  parseEnVocabExampleSentenceItems,
  serializeEnVocabExampleSentenceItems,
  stripEnVocabExampleGlossLabel,
} from "@/lib/en-vocab-example-sentences";
import { parseEnVocabUsagePoints } from "@/lib/en-vocab-usage-ai";

/** 上传/本地模型须遵守的英语例句契约（须先有 usage；一句对应一条用法） */
export const EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC = {
  version: 2,
  count_rule:
    "条数 = 用法编号条数；第 N 句必须对应第 N 条用法（须先有 usage）",
  format_example:
    "I put the book above the shelf.\n译文：我把书放在架子上面。\nSee the note above for details.\n译文：详情见上文注释。",
  rules: [
    "必须已有「用法」编号说明；按用法逐条造句，禁止脱离用法自由发挥",
    "存库不要写行首序号（展示层会加 1、2、3…）",
    "每条：英文一行，下一行必须以「译文：」开头的中文（禁止「译文：/ …」）",
    "初中口语、短句；例句里其它词尽量用最常见的基础词（avoid / however / furthermore 等偏难词）",
    "写回时请传 source，建议「本地 gemma4:26b」；人手填写为「手动」",
  ],
  reject_reasons: [
    "empty",
    "usage_required",
    "usage_unparsed",
    "need_pair_lines",
    "wrong_example_count",
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
  /** 已存库的编号用法正文（必填才能造句） */
  usage?: string | null;
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

请为上述英语${kindLabel}写例句，供初中学习者复习抽问。

条数规则（必须遵守）：
- 必须写恰好 ${expectedCount} 句（与用法条数相同）。
- 第 1 句只体现用法 1；第 2 句只体现用法 2；以此类推，一一对应。
- 禁止脱离上列用法自由发挥；禁止两句挤同一条用法。

用词与难度：
- 句子要短、口语；除目标词外，其余单词尽量用最简单常见的词（如 I / you / the / book / today）。
- 不要生僻词、长难从句、学术套话；抽问时焦点应落在目标词上。

格式要求：
1. 每条英文必须原样出现词条文字「${input.word.trim()}」（可改大小写）。多词词条如 Present Perfect 也须写出这几个词，禁止只示范时态/含义却不写词条原文。
2. 语法条同样须在句中自然出现该语法点对应的词条文字。
3. 每条英文下一行写中文译义，必须以「译文：」开头；「译文：」后直接写中文，禁止「译文：/ …」。
4. 只输出英文行与下一行「译文：」+中文交替；不要行首编号、不要 markdown、不要解释。`;
}

function wordUsedInEnglish(sentence: string, word: string, kind: string): boolean {
  const target = word.trim();
  if (!target) return false;
  // 语法 / 多词词条：须出现词条原文（模型常只示范时态导致 word_not_used）
  if (kind === "grammar" || /[\s-]/.test(target)) {
    return sentence.toLowerCase().includes(target.toLowerCase().replace(/^～/, ""));
  }
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return re.test(sentence);
}

/** 校验 AI 返回的例句块是否可用（条数须与 usage 一致） */
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
