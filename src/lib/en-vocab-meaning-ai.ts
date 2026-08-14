/** 英语释义 + 词性上传契约（list_missing 原样返回；与本地模型约定一致） */

export const EN_VOCAB_MEANING_UPLOAD_SPEC = {
  version: 1,
  max_senses: 3,
  separator: "；",
  format_example: "期待；盼望",
  pos_example: "v",
  pos_multi_example: "adj/n",
  rules: [
    "只补「单词」缺释义/词性（grammar 语法条不走此接口）",
    "中文释义；一词多义时只写最常用的 1～3 个义项",
    "义项之间用中文分号「；」分隔，不要用英文分号或顿号",
    "词性用英文缩写：n / v / adj / adv / prep / conj / pron / det / num / interj / phrase",
    "词条含空格的固定搭配（unbearably tough、in time）词性用 phrase，不要按中心词标 adj/adv；短语动词（look forward to）仍标 v；复合介词（in spite of）仍标 prep",
    "多词性用斜杠「/」连接，如 adj/n；不要写中文「名词」「动词」",
    "不要编号、不要 markdown、不要整句解释",
    "写回时请传 source，建议「gemma4:26b 本地」；人手为「手动」",
  ],
  source_examples: ["gemma4:26b 本地", "dictionaryapi.dev", "手动"],
  reject_reasons: [
    "empty",
    "too_long",
    "no_chinese",
    "too_many_senses",
    "has_markdown",
    "invalid_pos",
  ],
} as const;

const HAN_RE = /[\u4E00-\u9FFF]/;
const MARKDOWN_RE = /[`*_#\[\]|>]/;
const MEANING_MAX_LEN = 80;

/** 允许的词性 token（小写存库） */
const POS_TOKEN_RE =
  /^(n|v|adj|adv|prep|conj|pron|det|num|interj|phrase|aux|modal)$/i;

const POS_ALIASES: Record<string, string> = {
  noun: "n",
  verb: "v",
  adjective: "adj",
  adverb: "adv",
  preposition: "prep",
  conjunction: "conj",
  pronoun: "pron",
  determiner: "det",
  article: "det",
  number: "num",
  numeral: "num",
  interjection: "interj",
  exclamation: "interj",
  phrasal: "phrase",
  "phrasal verb": "v",
  auxiliary: "aux",
  "modal verb": "modal",
};

export type EnVocabMeaningAiInput = {
  word: string;
  reading?: string | null;
  kind?: string;
  need_meaning?: boolean;
  need_pos?: boolean;
};

export function buildEnVocabMeaningAiPrompt(input: EnVocabMeaningAiInput): string {
  const reading = input.reading?.trim();
  const needMeaning = input.need_meaning !== false;
  const needPos = input.need_pos !== false;
  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `音标：${reading}` : null,
    "类型：单词",
  ]
    .filter(Boolean)
    .join("\n");

  const jobs: string[] = [];
  if (needMeaning) {
    jobs.push(
      "释义行：最常用 1～3 个中文义项，用中文分号「；」连接，例如：期待；盼望"
    );
  }
  if (needPos) {
    jobs.push(
      "词性行：英文缩写（n/v/adj/adv/prep/conj/pron/phrase…）；多词性用 /，例如：adj/n。含空格的固定搭配用 phrase，不要标 adj/adv"
    );
  }

  return `${meta}

请为上述英语单词补全字段，供初中/高中水平学习者复习。

请严格按下面顺序输出（缺哪项就省略哪行，不要解释）：
${jobs.map((j, i) => `${i + 1}. ${j}`).join("\n")}

规则：
- 不要编号、不要 markdown、不要例句
- 释义必须是中文；词性必须是英文缩写
- 词条含空格的固定搭配（如 unbearably tough）词性必须是 phrase，禁止按中心词标 adj/adv
- 短语动词（look forward to / give up）仍标 v；复合介词仍标 prep
- 只输出字段正文行`;
}

/** 规范化：按 ；/;/,/、 拆开，去重，最多 3 义，再用 ； 拼接 */
export function normalizeEnVocabMeaningText(raw: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const chunk of String(raw || "").split(/[;；、,，/／|｜]+/)) {
    const item = chunk
      .trim()
      .replace(/^[\d]+[.、．)\]]\s*/, "")
      .replace(/[。.]+$/, "");
    if (!item || seen.has(item)) continue;
    seen.add(item);
    parts.push(item);
    if (parts.length >= EN_VOCAB_MEANING_UPLOAD_SPEC.max_senses) break;
  }
  return parts.join(EN_VOCAB_MEANING_UPLOAD_SPEC.separator);
}

export function validateEnVocabMeaningAiOutput(
  raw: string
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = normalizeEnVocabMeaningText(raw);
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MEANING_MAX_LEN) return { ok: false, reason: "too_long" };
  if (MARKDOWN_RE.test(text)) return { ok: false, reason: "has_markdown" };
  if (!HAN_RE.test(text)) return { ok: false, reason: "no_chinese" };
  const senses = text
    .split(EN_VOCAB_MEANING_UPLOAD_SPEC.separator)
    .filter(Boolean);
  if (senses.length > EN_VOCAB_MEANING_UPLOAD_SPEC.max_senses) {
    return { ok: false, reason: "too_many_senses" };
  }
  return { ok: true, text };
}

function mapPosToken(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\.+$/, "");
  if (!t) return null;
  if (POS_ALIASES[t]) return POS_ALIASES[t];
  if (POS_TOKEN_RE.test(t)) return t.toLowerCase();
  return null;
}

/** 词条含空格 → 固定搭配；若只标了 adj/adv（中心词词性）应改成 phrase。 */
export function enVocabLemmaNeedsPhrasePos(raw: string): boolean {
  const word = String(raw || "").trim();
  return Boolean(word && /\s/.test(word));
}

function rewritePosTokensForLemma(word: string, tokens: string[]): string[] {
  if (!enVocabLemmaNeedsPhrasePos(word)) return tokens;
  const lexical = tokens.filter((t) => t !== "phrase");
  if (lexical.length === 0) return tokens;
  const onlyAdjOrAdv = lexical.every((t) => t === "adj" || t === "adv");
  return onlyAdjOrAdv ? ["phrase"] : tokens;
}

/** 规范化词性：adj/n；多词搭配误标 adj/adv 时改成 phrase；非法则 null */
export function normalizeEnVocabPos(
  raw: string | null | undefined,
  word?: string | null
): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const chunk of String(raw ?? "").split(/[\/／|,，;；]+/)) {
    const mapped = mapPosToken(chunk);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    parts.push(mapped);
    if (parts.length >= 4) break;
  }
  const rewritten = rewritePosTokensForLemma(String(word ?? ""), parts);
  return rewritten.length ? rewritten.join("/") : null;
}

export function validateEnVocabPos(
  raw: string,
  word?: string | null
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = normalizeEnVocabPos(raw, word);
  if (!text) return { ok: false, reason: "invalid_pos" };
  return { ok: true, text };
}

export function normalizeEnVocabMeaningSource(
  raw: string | null | undefined
): string | null {
  const t = String(raw ?? "").trim();
  return t || null;
}
