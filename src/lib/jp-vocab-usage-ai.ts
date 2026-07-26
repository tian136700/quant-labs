/** 日语语法用法上传契约：编号中文说明（N5～N2 常用度降序） */

export const JP_VOCAB_USAGE_UPLOAD_SPEC = {
  version: 2,
  count_rule:
    "至少 2 组；每组=1 条用法说明 + 1 条例句（日语+译文）；常用度降序；一词一次付费调用同时写回",
  format_example:
    "1. 表示原因、理由：前句说明原因，后句说明结果。\n今日(きょう)は雨(あめ)だから、家(いえ)にいます。\n译文：今天下雨，所以我待在家里。\n2. 表示接续：承接上文，引出下一句。\n疲(つか)れたから、早(はや)く寝(ね)ます。\n译文：我累了，所以早点睡。",
  level: "N5～N2（含 N1 以下；不要超纲冷僻用法）",
  rules: [
    "只补「语法」（单词不走此接口）",
    "用法与例句必须同一次输出、一一对应：编号用法下一行立刻跟日语例句，再下一行「译文：」",
    "禁止拆成「先用法、后例句」两次模型调用",
    "每组以「1.」「2.」… 开头写中文用法；紧跟日语（汉字后半角括号假名）与「译文：」",
    "水平限定 N5～N2：最常用排第一；例句只用简单词、不叠更难语法",
    "至少 2 组；不要 markdown、不要行首给例句再编一次号",
    "写回时请传 source，建议「线上 claude-…」；人手为「手动」",
  ],
  source_examples: ["线上 claude-sonnet-4-6", "本地 gemma4:26b", "手动"],
  reject_reasons: [
    "empty",
    "need_two_points",
    "invalid_numbering",
    "not_grammar",
    "pair_incomplete",
    "examples_invalid",
  ],
} as const;

export type JpVocabUsageAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
};

const NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
const HAN_RE = /[\u4E00-\u9FFF]/;
const FENCE_RE = /^```(?:\w+)?\s*$/;
/** 正文禁止写 JLPT / 考试标签 */
const JP_VOCAB_USAGE_LEVEL_LABEL_RE =
  /\bN[1-5]\b|JLPT|日语能力|能力考|高考|考研/i;

/**
 * 语法：用法+例句同一次输出（1:1）。
 * 禁止拆成两次模型调用。
 */
export function buildJpVocabUsageAiPrompt(input: JpVocabUsageAiInput): string {
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const grammarCore = input.word
    .trim()
    .replace(/^[～~〜]+/, "")
    .replace(/[～~〜]+$/, "");
  const meta = [
    `词条：${input.word.trim()}`,
    grammarCore
      ? `语法点：句中例句必须自然出现「${grammarCore}」（词条里的「～」「〜」禁止写进例句）。中文教学标题（如「て形变形」）不要求原文照抄。`
      : null,
    reading ? `读音：${reading}` : null,
    meaning ? `旧释义参考（可忽略）：${meaning}` : null,
    "类型：语法",
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请为上述日语语法一次写完「用法 + 例句」，供 N5～N2 抽问卡片复习。

硬规则（必须遵守）：
- 同一次输出里完成：每条用法下面立刻跟 1 条例句（日语 + 译文）。禁止只写用法、禁止只写例句、禁止拆成两轮。
- 至少 2 组；按常用程度排序：第 1 组最常用。
- 水平约 N5～N2；不要超纲冷僻用法。
- 例句只用简单词；不要再叠另一个更难的语法（焦点只有本语法）。
- 中文用法说明；可在引号内保留日语形态。
- 每个汉字后立刻半角括号假名；「译文：」后直接中文；不要行首给例句再编号。

输出格式（严格按此交替，不要 markdown、不要标题、不要 JLPT 标签）：
1. 表示原因、理由：前句说明原因，后句说明结果。
今日(きょう)は雨(あめ)だから、家(いえ)にいます。
译文：今天下雨，所以我待在家里。
2. 表示接续：承接上文，引出下一句。
疲(つか)れたから、早(はや)く寝(ね)ます。
译文：我累了，所以早点睡。`;
}

export type JpVocabGrammarUsageExamplePairParsed = {
  usage: string;
  example_sentences: string;
};

/**
 * 解析「编号用法 + 日语 + 译文」交替块。
 * 失败返回 null。
 */
export function parseJpVocabGrammarUsageExamplePairs(
  raw: string
): JpVocabGrammarUsageExamplePairParsed | null {
  const lines = stripFenceNoise(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  type Block = { n: number; usage: string; body: string[] };
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const line of lines) {
    const m = NUMBERED_LINE_RE.exec(line);
    if (m) {
      if (cur) blocks.push(cur);
      cur = { n: Number(m[1]), usage: m[2].trim(), body: [] };
      continue;
    }
    if (!cur) return null;
    cur.body.push(line);
  }
  if (cur) blocks.push(cur);
  if (blocks.length < 2) return null;

  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].n !== i + 1) return null;
    if (!blocks[i].usage || !HAN_RE.test(blocks[i].usage)) return null;
    if (blocks[i].body.length < 2) return null;
  }

  const usage = serializeJpVocabUsagePoints(
    blocks.map((b) => ({ n: b.n, text: b.usage }))
  );
  const example_sentences = blocks
    .map((b) => b.body.join("\n"))
    .join("\n");
  return { usage, example_sentences };
}

function stripFenceNoise(raw: string): string {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !FENCE_RE.test(line))
    .join("\n");
}

/** 解析并规范化编号用法行；失败返回 null */
export function parseJpVocabUsagePoints(
  raw: string
): { n: number; text: string }[] | null {
  const lines = stripFenceNoise(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const points: { n: number; text: string }[] = [];
  for (const line of lines) {
    const m = NUMBERED_LINE_RE.exec(line);
    if (!m) return null;
    const n = Number(m[1]);
    const text = m[2].trim();
    if (!Number.isInteger(n) || n <= 0 || !text) return null;
    if (!HAN_RE.test(text)) return null;
    points.push({ n, text });
  }
  if (!points.length) return null;

  for (let i = 0; i < points.length; i++) {
    if (points[i].n !== i + 1) return null;
  }
  return points;
}

export function serializeJpVocabUsagePoints(
  points: { n: number; text: string }[]
): string {
  return points.map((p, i) => `${i + 1}. ${p.text.trim()}`).join("\n");
}

export function normalizeJpVocabUsageText(
  raw: string | null | undefined
): string | null {
  const points = parseJpVocabUsagePoints(String(raw ?? ""));
  if (!points || points.length < 2) return null;
  return serializeJpVocabUsagePoints(points);
}

export function normalizeJpVocabUsageSource(
  raw: string | null | undefined
): string | null {
  const t = String(raw ?? "").trim();
  return t || null;
}

/** 用法条数（驱动例句 1:1）；无效则 0 */
export function countJpVocabUsagePoints(
  usage: string | null | undefined
): number {
  const points = parseJpVocabUsagePoints(String(usage ?? ""));
  return points?.length ?? 0;
}

export function jpVocabUsagePairLabel(n: number): string {
  return `${n}.用法`;
}

export function formatJpVocabUsageForDisplay(raw: string): string {
  const points = parseJpVocabUsagePoints(String(raw ?? ""));
  if (!points?.length) return String(raw ?? "").trim();
  return points
    .map((p, i) => `${jpVocabUsagePairLabel(i + 1)}：${p.text}`)
    .join("\n");
}

export function validateJpVocabUsageAiOutput(
  raw: string,
  input?: JpVocabUsageAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  if (input && input.kind !== "grammar") {
    return { ok: false, reason: "not_grammar" };
  }
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (JP_VOCAB_USAGE_LEVEL_LABEL_RE.test(text)) {
    // 剥标签后再验；剥光则 invalid
    const stripped = text.replace(JP_VOCAB_USAGE_LEVEL_LABEL_RE, "").trim();
    const points = parseJpVocabUsagePoints(stripped);
    if (!points) return { ok: false, reason: "invalid_numbering" };
    if (points.length < 2) return { ok: false, reason: "need_two_points" };
    return { ok: true, text: serializeJpVocabUsagePoints(points) };
  }
  const points = parseJpVocabUsagePoints(text);
  if (!points) return { ok: false, reason: "invalid_numbering" };
  if (points.length < 2) return { ok: false, reason: "need_two_points" };
  return { ok: true, text: serializeJpVocabUsagePoints(points) };
}

/** 用法+例句成对校验（只拆对；例句细则由 fill apply 再验） */
export function validateJpVocabGrammarUsageExamplePairsOutput(
  raw: string,
  input?: JpVocabUsageAiInput
):
  | { ok: true; usage: string; example_sentences: string }
  | { ok: false; reason: string } {
  if (input && input.kind !== "grammar") {
    return { ok: false, reason: "not_grammar" };
  }
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
  const stripped = JP_VOCAB_USAGE_LEVEL_LABEL_RE.test(text)
    ? text.replace(JP_VOCAB_USAGE_LEVEL_LABEL_RE, "").trim()
    : text;
  const parsed = parseJpVocabGrammarUsageExamplePairs(stripped);
  if (!parsed) return { ok: false, reason: "pair_incomplete" };
  const usageOk = validateJpVocabUsageAiOutput(parsed.usage, input);
  if (!usageOk.ok) return { ok: false, reason: usageOk.reason };
  return {
    ok: true,
    usage: usageOk.text,
    example_sentences: parsed.example_sentences,
  };
}
