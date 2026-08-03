import "server-only";

/** 日语词性上传契约（list_missing 原样返回；与本地模型约定一致） */
export const JP_VOCAB_POS_UPLOAD_SPEC = {
  version: 2,
  format_example: "他动词",
  multi_example: "名词/副词",
  rules: [
    "只补「单词」缺词性（grammar 语法条不走此接口）",
    "词性用中文：名词、动词、他动词、自动词、い形容词、な形容词、副词、助词、接続词、感叹词、数词、连体词 等",
    "动词须尽量区分：他动词 → 写「他动词」；自动词 → 写「自动词」；不分或不清楚 → 写「动词」",
    "多词性用斜杠「/」连接，例如：名词/副词；同一词兼有他动与自动用法可写「他动词/自动词」",
    "不要编号、不要 markdown、不要释义、不要例句",
    "写回时请传 source，建议「线上 claude-sonnet-4-6」或「本地 gemma4:26b」；人手为「手动」",
  ],
  source_examples: ["线上 claude-sonnet-4-6", "本地 gemma4:26b", "Qwen本地", "手动"],
  reject_reasons: ["empty", "too_long", "has_markdown", "invalid_pos", "has_latin_only"],
} as const;

const HAN_RE = /[\u4E00-\u9FFF]/;
const MARKDOWN_RE = /[`*_#\[\]|>]/;
const POS_MAX_LEN = 24;

/** 允许的词性 token（中文存库） */
const POS_TOKEN_RE =
  /^(名词|他动词|自动词|动词|い形容词|な形容词|形容词|副词|助词|接続词|接续词|感叹词|数词|连体词|代词|接尾词|接头词|连语|固有名詞|专有名词)$/;

const POS_ALIASES: Record<string, string> = {
  名詞: "名词",
  動詞: "动词",
  他動詞: "他动词",
  自動詞: "自动词",
  他动: "他动词",
  自动: "自动词",
  形容詞: "形容词",
  い形: "い形容词",
  ナ形: "な形容词",
  な形: "な形容词",
  副詞: "副词",
  助詞: "助词",
  接続詞: "接続词",
  感嘆詞: "感叹词",
  数詞: "数词",
  連体詞: "连体词",
  代名詞: "代词",
  寒暄语: "感叹词",
  寒暄: "感叹词",
  问候语: "感叹词",
  挨拶: "感叹词",
  语气词: "感叹词",
  国名: "专有名词",
  地名: "专有名词",
  固有名词: "专有名词",
};

export type JpVocabPosAiInput = {
  word: string;
  reading?: string | null;
  kind?: string;
};

export function buildJpVocabPosAiPrompt(input: JpVocabPosAiInput): string {
  const reading = input.reading?.trim();
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `读音：${reading}` : null,
    "类型：单词",
  ]
    .filter(Boolean)
    .join("\n");

  return `${meta}

请为上述日语单词写词性，供 N5/N4 初学者复习。

规则（必须遵守）：
1. 只输出一行词性正文；用中文
2. 只能从这些里选：名词、他动词、自动词、动词、い形容词、な形容词、副词、助词、接続词、感叹词、数词、连体词、代词、接尾词、接头词、连语、专有名词
3. 【动词·必守】能判断则写细类：他动词 →「他动词」；自动词 →「自动词」；该词不区分他动/自动、或拿不准 → 只写「动词」（不要硬猜）
4. 多词性用斜杠「/」连接，例如：名词/副词；同一词条兼有他动与自动用法可写「他动词/自动词」
5. 问候/寒暄套话用「感叹词」或「连语」；国名用「专有名词」；不要自造「寒暄语」
6. 不要释义、不要例句、不要编号、不要 markdown、不要解释过程
7. 只输出词性正文`;
}

function mapPosToken(raw: string): string | null {
  const t = raw.trim().replace(/[。.．]+$/g, "");
  if (!t) return null;
  if (POS_ALIASES[t]) return POS_ALIASES[t];
  if (POS_TOKEN_RE.test(t)) {
    if (t === "接续词") return "接続词";
    if (t === "形容词") return "い形容词";
    return t;
  }
  return null;
}

export function normalizeJpVocabPosText(raw: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const cleaned = String(raw || "")
    .replace(/^(词性|pos)\s*[:：]\s*/i, "")
    .trim();
  for (const chunk of cleaned.split(/[\/／|,，;；]+/)) {
    const mapped = mapPosToken(chunk);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    parts.push(mapped);
    if (parts.length >= 3) break;
  }
  return parts.join("/");
}

export function validateJpVocabPosAiOutput(
  raw: string
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = normalizeJpVocabPosText(raw);
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > POS_MAX_LEN) return { ok: false, reason: "too_long" };
  if (MARKDOWN_RE.test(text)) return { ok: false, reason: "has_markdown" };
  if (!HAN_RE.test(text)) return { ok: false, reason: "invalid_pos" };
  if (/^[A-Za-z0-9\s\-_/]+$/.test(text)) {
    return { ok: false, reason: "has_latin_only" };
  }
  return { ok: true, text };
}
