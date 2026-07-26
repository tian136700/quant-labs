/** 日语语法用法上传契约：编号中文说明（N5～N2 常用度降序） */

export const JP_VOCAB_USAGE_UPLOAD_SPEC = {
  version: 1,
  count_rule: "至少 2 条编号用法；按常用程度排序：第 1 条最常用",
  format_example:
    "1. 表示原因、理由：前句说明原因，后句说明结果。\n2. 表示接续：承接上文，引出下一句。",
  level: "N5～N2（含 N1 以下；不要超纲冷僻用法）",
  rules: [
    "只补「语法」缺用法（单词不走此接口）",
    "每行必须以「1.」「2.」… 编号开头（半角点号）",
    "说明用中文；可在引号内保留日语语法形态",
    "水平限定 N5～N2：最常用排第一，其后递减；不要堆冷僻义",
    "至少 2 条；不要 markdown、不要造例句（例句另有 fill 阶段）",
    "写回时请传 source，建议「线上 claude-…」；人手为「手动」",
  ],
  source_examples: ["线上 claude-sonnet-4-6", "本地 gemma4:26b", "手动"],
  reject_reasons: ["empty", "need_two_points", "invalid_numbering", "not_grammar"],
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

export function buildJpVocabUsageAiPrompt(input: JpVocabUsageAiInput): string {
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const grammarCore = input.word
    .trim()
    .replace(/^[～~〜]+/, "")
    .replace(/[～~〜]+$/, "");
  const meta = [
    `词条：${input.word.trim()}`,
    grammarCore && grammarCore !== input.word.trim()
      ? `语法核心：${grammarCore}`
      : null,
    reading ? `读音：${reading}` : null,
    meaning ? `旧释义参考（可忽略）：${meaning}` : null,
    "类型：语法",
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请为上述日语语法列出常用用法说明，供 N5～N2 学习者复习（抽问卡片「用法」栏）。

条数与内容：
- 至少写 2 条编号说明；按常用程度排序：第 1 条最常用，其后递减。
- 水平限定日常口语与考试常见用法（约 N5～N2）；不要超纲冷僻义。
- 用中文解释接续、语气、典型场景；可在引号内保留日语形态（如「～てから」）。
- 不要造例句（例句另有阶段按用法 1:1 生成）。

格式要求（必须严格遵守）：
1. 只输出编号行，形如：
1. 表示原因、理由：前句说明原因，后句说明结果。
2. 表示接续：承接上文，引出下一句。
2. 编号从 1 连续递增；半角「数字.」后接正文。
3. 正文禁止出现 N1/N2/JLPT/能力考等标签字样。
4. 不要 markdown、不要标题、不要例句、不要额外解释。`;
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
