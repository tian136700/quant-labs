/** 英语用法上传契约：编号中文说明（选题按学术考试高频；正文禁考试标签） */

/**
 * 展示/存库正文禁止的考试品牌与标签。
 * 选题仍可按「学术英语考试写作/阅读/听力高频」来做，但字面不得出现这些词。
 */
export const EN_VOCAB_USAGE_EXAM_LABEL_RE =
  /雅思|托福|四六级|考研|专四|专八|IELTS|TOEFL|ielts|toefl|\bCET\b|\bGRE\b|\bGMAT\b|\bSAT\b/i;

export const EN_VOCAB_USAGE_UPLOAD_SPEC = {
  version: 1,
  count_rule: "至少 2 条编号用法；聚焦写作/阅读/听力高频用法（覆盖常见义项）",
  format_example:
    "1. 介词：表示「在……之上」；常用于描述位置关系。\n2. 副词：表示「在上方；在上文中」。",
  rules: [
    "每行必须以「1.」「2.」… 编号开头（半角点号）",
    "说明用中文；可在引号内保留英文术语（如「look forward to」）",
    "聚焦写作、阅读、听力中的高频用法",
    "上传接口自动屏蔽考试名称/标签（雅思、托福、IELTS、TOEFL、四六级、考研等）——直接去掉该词，不拒整段",
    "至少 2 条；多词性/多义时按常用度分条，勿把无关冷僻义塞进来",
    "不要 markdown、不要整段散文、不要造例句（例句另有 fill 阶段）",
    "写回时请传 source，建议「本地 gemma4:26b」；人手为「手动」",
  ],
  reject_reasons: [
    "empty",
    "need_two_points",
    "invalid_numbering",
  ],
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

请为上述英语${kindLabel}列出常用用法说明。

选材（仅供你选题，禁止写进正文）：优先该词在学术英语考试写作、阅读、听力里的高频用法与搭配。

条数与内容：
- 至少写 2 条编号说明；若有多种常用词性/义项，每种一条。
- 聚焦高频用法；不要堆冷僻义。
- 用中文解释；可在引号内保留英文短语或术语。

格式要求（必须严格遵守）：
1. 只输出编号行，形如：
1. 介词：表示「在……之上」；常用于描述位置关系。
2. 副词：表示「在上方；在上文中」。
2. 编号从 1 连续递增；半角「数字.」后接正文。
3. 正文中绝对禁止出现任何考试名称或标签（不要写：雅思、托福、IELTS、TOEFL、四六级、考研、专四、专八、GRE、GMAT、SAT、CET 等）。
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

export function enVocabUsageHasExamLabel(raw: string): boolean {
  return EN_VOCAB_USAGE_EXAM_LABEL_RE.test(String(raw ?? ""));
}

/** 复合标签先剥，减少「IELTS/TOEFL」「雅思/托福」残留斜杠 */
const EN_VOCAB_USAGE_EXAM_LABEL_COMPOUND_RE =
  /IELTS\s*[\/／、&]\s*TOEFL|TOEFL\s*[\/／、&]\s*IELTS|雅思\s*[\/／、或和与]\s*托福|托福\s*[\/／、或和与]\s*雅思/gi;

const EN_VOCAB_USAGE_IMAGE_LINE_RE = /^!\[[^\]]*\]\([^)]+\)\s*$/;

const EN_VOCAB_USAGE_CN_ORDINALS = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
] as const;

function enVocabUsageCnOrdinal(n: number): string {
  if (n >= 1 && n <= EN_VOCAB_USAGE_CN_ORDINALS.length) {
    return EN_VOCAB_USAGE_CN_ORDINALS[n - 1];
  }
  return String(n);
}

/** 剥标签后清多余标点/空格；空编号行返回 "" */
function cleanEnVocabUsageLineDebris(line: string): string {
  let s = String(line || "")
    .replace(/\s{2,}/g, " ")
    .replace(/[；;]{2,}/g, "；")
    .replace(/[，,]{2,}/g, "，")
    .replace(/([：:；;，,、])\s+/g, "$1")
    .replace(/\s+([：:；;，,、。．.!！？?])/g, "$1")
    .replace(/([：:])\s*[；;，,、／/]+\s*/g, "$1")
    .replace(/\s*[；;，,、／/]+\s*([。．.!！？?])/g, "$1")
    .replace(/([。．.!！？?])\s*[；;，,、／/]+/g, "$1")
    // 汉字之间因剥标签留下的空格（「在 语法」→「在语法」）
    .replace(/([\u4E00-\u9FFF])\s+(?=[\u4E00-\u9FFF])/g, "$1")
    .trim();
  s = s.replace(/^(\d+\s*[.、．)\]]\s*)[；;，,、／/]+\s*/, "$1");
  s = s.replace(/[；;，,、／/\s]+$/g, "").trim();
  if (/^\d+\s*[.、．)\]]\s*$/.test(s)) return "";
  return s;
}

/**
 * 从用法正文去掉考试品牌/标签，保留编号义项（至少 1 条即可）。
 * 含图片 markdown 行时原样保留。无标签则原样返回。
 */
export function stripEnVocabUsageExamLabels(raw: string): string {
  const original = String(raw ?? "");
  if (!original.trim()) return original;
  if (!enVocabUsageHasExamLabel(original)) return original;

  const stripped = original
    .replace(EN_VOCAB_USAGE_EXAM_LABEL_COMPOUND_RE, "")
    .replace(EN_VOCAB_USAGE_EXAM_LABEL_RE, "");

  const lines = stripped
    .split(/\r?\n/)
    .map((ln) => cleanEnVocabUsageLineDebris(ln))
    .filter((ln) => ln.trim());

  const out: string[] = [];
  let pointIdx = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (EN_VOCAB_USAGE_IMAGE_LINE_RE.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    const m = NUMBERED_LINE_RE.exec(trimmed);
    if (m) {
      const body = m[2].trim();
      if (!body || !HAN_RE.test(body)) continue;
      pointIdx += 1;
      out.push(`${pointIdx}. ${body}`);
      continue;
    }
    out.push(trimmed);
  }
  return out.join("\n");
}

/**
 * 展示用：先剥考试标签，编号行改成「用法一：… / 用法二：…」。
 * 仅一条时只显示「用法一：…」。图片行不动。
 */
export function formatEnVocabUsageForDisplay(raw: string): string {
  const stripped = stripEnVocabUsageExamLabels(String(raw ?? ""));
  if (!stripped.trim()) return "";

  const lines = stripped.split(/\r?\n/);
  const out: string[] = [];
  let pointIdx = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (EN_VOCAB_USAGE_IMAGE_LINE_RE.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    const m = NUMBERED_LINE_RE.exec(trimmed);
    if (m) {
      const body = m[2].trim();
      if (!body) continue;
      pointIdx += 1;
      out.push(`用法${enVocabUsageCnOrdinal(pointIdx)}：${body}`);
      continue;
    }
    out.push(trimmed);
  }
  return out.join("\n");
}

/**
 * 上传入口屏蔽：雅思/托福/IELTS/TOEFL 等考试标签直接去掉，再入库。
 * fill-usage apply、编辑保存用法统一走这里。
 */
export function shieldEnVocabUsageUploadText(raw: string): string {
  return stripEnVocabUsageExamLabels(String(raw ?? "")).trim();
}

/** 校验 AI 返回的用法块是否可用（先屏蔽考试标签，再验编号格式） */
export function validateEnVocabUsageAiOutput(
  raw: string,
  _input?: EnVocabUsageAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = shieldEnVocabUsageUploadText(raw);
  if (!text) return { ok: false, reason: "empty" };

  const points = parseEnVocabUsagePoints(text);
  if (!points) return { ok: false, reason: "invalid_numbering" };
  if (points.length < 2) return { ok: false, reason: "need_two_points" };

  return { ok: true, text: serializeEnVocabUsagePoints(points) };
}
