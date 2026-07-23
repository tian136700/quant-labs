/** 英语用法（IELTS/TOEFL）上传契约：编号中文说明 */

export const EN_VOCAB_USAGE_UPLOAD_SPEC = {
  version: 1,
  count_rule: "至少 2 条编号用法；聚焦 IELTS/TOEFL 常考用法（覆盖常见义项）",
  format_example:
    "1. 介词：表示「在……之上」；IELTS/TOEFL 写作与阅读中常考方位描述。\n2. 副词：表示「在上方；在上文中」。",
  rules: [
    "每行必须以「1.」「2.」… 编号开头（半角点号）",
    "说明用中文；可在引号内保留英文术语（如「look forward to」）",
    "聚焦 IELTS/TOEFL 写作、阅读、听力中的常考用法",
    "至少 2 条；多词性/多义时按考频分条，勿把无关冷僻义塞进来",
    "不要 markdown、不要整段散文、不要造例句（例句另有 fill 阶段）",
    "写回时请传 source，建议「本地 gemma4:26b」；人手为「手动」",
  ],
  reject_reasons: ["empty", "need_two_points", "invalid_numbering"],
} as const;

export type EnVocabUsageAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
};

const NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
const HAN_RE = /[\u4E00-\u9FFF]/;
const FENCE_RE = /^```(?:\w+)?\s*$/;

export function buildEnVocabUsageAiPrompt(input: EnVocabUsageAiInput): string {
  const kindLabel = input.kind === "grammar" ? "语法" : "单词";
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const pos = input.pos?.trim();
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `音标：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    pos ? `词性：${pos}` : null,
    `类型：${kindLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请为上述英语${kindLabel}列出 IELTS / TOEFL 考试相关用法说明（这些考试覆盖常见用法）。

条数与内容：
- 至少写 2 条编号说明；若有多种常考词性/义项，每种一条。
- 聚焦写作、阅读、听力中的高频考法；不要堆冷僻义。
- 用中文解释；可在引号内保留英文短语或术语。

格式要求（必须严格遵守）：
1. 只输出编号行，形如：
1. 介词：表示「在……之上」；IELTS/TOEFL 写作与阅读中常考方位描述。
2. 副词：表示「在上方；在上文中」。
2. 编号从 1 连续递增；半角「数字.」后接正文。
3. 不要 markdown、不要标题、不要例句、不要额外解释。`;
}

function stripFenceNoise(raw: string): string {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !FENCE_RE.test(line))
    .join("\n");
}

/** 解析并规范化编号用法行；失败返回 null */
export function parseEnVocabUsagePoints(
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

  // 必须从 1 连续递增
  for (let i = 0; i < points.length; i++) {
    if (points[i].n !== i + 1) return null;
  }
  return points;
}

export function serializeEnVocabUsagePoints(
  points: { n: number; text: string }[]
): string {
  return points.map((p, i) => `${i + 1}. ${p.text.trim()}`).join("\n");
}

export function normalizeEnVocabUsageText(
  raw: string | null | undefined
): string | null {
  const points = parseEnVocabUsagePoints(String(raw ?? ""));
  if (!points || points.length < 2) return null;
  return serializeEnVocabUsagePoints(points);
}

export function normalizeEnVocabUsageSource(
  raw: string | null | undefined
): string | null {
  const t = String(raw ?? "").trim();
  return t || null;
}

/** 校验 AI 返回的用法块是否可用 */
export function validateEnVocabUsageAiOutput(
  raw: string,
  _input?: EnVocabUsageAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };

  const points = parseEnVocabUsagePoints(text);
  if (!points) return { ok: false, reason: "invalid_numbering" };
  if (points.length < 2) return { ok: false, reason: "need_two_points" };

  return { ok: true, text: serializeEnVocabUsagePoints(points) };
}
