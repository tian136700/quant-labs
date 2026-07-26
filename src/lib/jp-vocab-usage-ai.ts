/** 日语语法用法上传契约：编号「中文」说明 + 1:1 例句（同一次调用） */

export const JP_VOCAB_USAGE_UPLOAD_SPEC = {
  version: 3,
  count_rule:
    "组数=该语法真实常用用法数（N5～N2）；只有 1 种就 1 组，有几种写几组；禁止硬凑 2 组。每组=中文用法 + 1 条例句",
  format_example:
    "1. 表示原因、理由：前句说明原因，后句说明结果。\n今日(きょう)は雨(あめ)だから、家(いえ)にいます。\n译文：今天下雨，所以我待在家里。",
  level: "N5～N2（含 N1 以下；不要超纲冷僻用法）",
  rules: [
    "只补「语法」（单词不走此接口）",
    "用法说明必须是中文（学生要看得懂）；禁止整段日语用法；禁止在用法行里写汉字(假名)括注",
    "可在中文里用「」短引日语形态（如「～てから」），引号外不要假名",
    "用法与例句必须同一次输出、一一对应：编号中文用法下一行立刻跟日语例句，再下一行「译文：」",
    "禁止拆成「先用法、后例句」两次模型调用",
    "组数按真实常用义项：1 种→1 组，2 种→2 组，3 种→3 组；不要为了凑数硬写两组",
    "水平限定 N5～N2：最常用排第一；例句只用简单词、不叠更难语法",
    "不要 markdown、不要给例句再编行首号",
    "写回时请传 source，建议「线上 claude-…」；人手为「手动」",
  ],
  source_examples: ["线上 claude-sonnet-4-6", "本地 gemma4:26b", "手动"],
  reject_reasons: [
    "empty",
    "need_one_point",
    "invalid_numbering",
    "not_grammar",
    "usage_not_chinese",
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
/** 用法行里的假名括注（说明被写成日语了） */
const USAGE_FURIGANA_PAREN_RE = /\([\u3040-\u309Fー]+\)/;
const KANA_RE = /[\u3040-\u30FFー]/;

/**
 * 用法说明是否「不像中文」：
 * - 用法行出现 漢字(かな) 括注 → 拒
 * - 去掉「」短引后仍有假名 → 拒（整段日语说明）
 */
export function jpVocabUsageLineLooksNonChinese(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return true;
  if (USAGE_FURIGANA_PAREN_RE.test(t)) return true;
  const noQuotes = t.replace(/「[^」]*」/g, "").replace(/"[^"]*"/g, "");
  return KANA_RE.test(noQuotes);
}

/**
 * 语法：用法+例句同一次输出（1:1）。
 * 禁止拆成两次模型调用。用法必须中文。
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

请为上述日语语法一次写完「用法 + 例句」，供中文母语的 N5～N2 学习者复习。

硬规则（必须遵守）：
- 同一次输出里完成：每条用法下面立刻跟 1 条例句（日语 + 译文）。禁止只写用法、禁止只写例句、禁止拆成两轮。
- 组数 = 该语法真实常用用法数（约 N5～N2 / 考试常见）：只有 1 种就写 1 组；有 2 种写 2 组；有 3 种写 3 组。禁止为了凑数硬写两组。
- 用法说明必须是中文，学生要看得懂。❌ 禁止整段日语用法；❌ 禁止在用法行写 漢字(かな) 假名括注。可在中文里用「」短引日语形态（如「冷たい」「～てから」）。
- 例句才是日语：简单词；不要再叠另一个更难的语法；每个汉字后半角括号假名；「译文：」后中文。
- 不要 markdown、不要 JLPT 标签、不要给例句再编行首号。
- 不要写总标题；第一行就必须是「1. …」中文用法。

输出格式示例（仅 1 种常用用法时就只输出 1 组；多种用法再继续 2. 3. …）：
1. 表示原因、理由：前句说明原因，后句说明结果。
今日(きょう)は雨(あめ)だから、家(いえ)にいます。
译文：今天下雨，所以我待在家里。`;
}

export type JpVocabGrammarUsageExamplePairParsed = {
  usage: string;
  example_sentences: string;
};

/**
 * 解析「编号用法 + 日语 + 译文」交替块。
 * 失败返回 null。至少 1 组。
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
  let started = false;
  for (const line of lines) {
    const m = NUMBERED_LINE_RE.exec(line);
    if (m) {
      started = true;
      if (cur) blocks.push(cur);
      cur = { n: Number(m[1]), usage: m[2].trim(), body: [] };
      continue;
    }
    // 允许模型多写标题行；正式内容从第一个「1.」开始
    if (!started) continue;
    if (!cur) return null;
    cur.body.push(line);
  }
  if (cur) blocks.push(cur);
  if (blocks.length < 1) return null;

  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].n !== i + 1) return null;
    if (!blocks[i].usage || !HAN_RE.test(blocks[i].usage)) return null;
    if (jpVocabUsageLineLooksNonChinese(blocks[i].usage)) return null;
    if (blocks[i].body.length < 2) return null;
  }

  const usage = serializeJpVocabUsagePoints(
    blocks.map((b) => ({ n: b.n, text: b.usage }))
  );
  const example_sentences = blocks.map((b) => b.body.join("\n")).join("\n");
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
    if (jpVocabUsageLineLooksNonChinese(text)) return null;
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
  if (!points || points.length < 1) return null;
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
  const candidate = JP_VOCAB_USAGE_LEVEL_LABEL_RE.test(text)
    ? text.replace(JP_VOCAB_USAGE_LEVEL_LABEL_RE, "").trim()
    : text;
  // 先挡日语用法（含假名括注），再解析编号
  for (const line of candidate.split(/\r?\n/)) {
    const m = NUMBERED_LINE_RE.exec(line.trim());
    const body = m ? m[2].trim() : line.trim();
    if (body && jpVocabUsageLineLooksNonChinese(body)) {
      return { ok: false, reason: "usage_not_chinese" };
    }
  }
  const points = parseJpVocabUsagePoints(candidate);
  if (!points) return { ok: false, reason: "invalid_numbering" };
  if (points.length < 1) return { ok: false, reason: "need_one_point" };
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
  if (!parsed) {
    // 拆对失败时区分：日语用法 vs 结构不全
    const numbered = stripped
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of numbered) {
      const m = NUMBERED_LINE_RE.exec(line);
      if (m && jpVocabUsageLineLooksNonChinese(m[2])) {
        return { ok: false, reason: "usage_not_chinese" };
      }
    }
    return { ok: false, reason: "pair_incomplete" };
  }
  const usageOk = validateJpVocabUsageAiOutput(parsed.usage, input);
  if (!usageOk.ok) return { ok: false, reason: usageOk.reason };
  return {
    ok: true,
    usage: usageOk.text,
    example_sentences: parsed.example_sentences,
  };
}
