import "server-only";

/** 释义上传契约（list_missing 会原样返回；与本地/线上词典约定一致） */
export const JP_VOCAB_MEANING_UPLOAD_SPEC = {
  version: 2,
  max_senses: 3,
  max_major_senses: 3,
  /** 同读音/大义项下的近义（按常用程度：第 1 个最常用） */
  sub_separator: "；",
  /** 不同读音/大义项（与 reading 字段斜杠段一一对应） */
  major_separator: "/",
  format_example: "送人；送东西",
  format_example_reading: "おくる",
  format_example_multi: "前面；以前/前面的；预先的",
  format_example_reading_multi: "まえ/ぜん",
  pos_example: "名词",
  pos_multi_example: "名词/副词",
  rules: [
    "只补「单词」缺释义（grammar 语法条不走此接口）",
    "缺释义时：若同时缺词性 / 例句，可在同一次写回一并补上（list_missing 的 need_pos / need_examples）",
    "只写最常用 1～3 个义项，按常用程度排序：第 1 个最常用，其后递减（例：送る → 送人；送东西）",
    "一词多种常用读音（如 前=まえ/ぜん、中=なか/ちゅう）时：不同读音/大义项用半角斜杠 / 分隔，段数与 reading 字段一致",
    "同一大义项下的近义仍用中文分号 ；，不要用英文分号或顿号",
    "斜杠前是第一义（训读等），斜杠后是第二义（音读/构词等）；例：前 → 前面；以前/前面的；预先的",
    "词性用中文：名词、动词、い形容词、な形容词、副词…；多词性用 /",
    "例句：只造比较常用的用法；条数 = max(2, 常用用法数)；释义含 / 时按斜杠段数；每条「日语」下一行「译文：」；汉字后半角括号假名",
    "不要编号、不要 markdown、不要整句解释（释义行不要日语假名）",
    "不要冷僻义挤在前面；不要堆砌词典全义",
    "写回时请传 source，建议「Claude」或「模型名 本地」；人手为「手动」",
  ],
  source_examples: ["Jisho", "gemma4:26b 本地", "Claude", "手动"],
  reject_reasons: [
    "empty",
    "too_long",
    "no_chinese",
    "too_many_senses",
    "too_many_major_senses",
    "has_markdown",
    "has_latin_only",
    "meta_label",
  ],
} as const;

/** 区块标题 / 提示词壳，曾被误当成释义写库（如字面「【释义】」） */
const MEANING_META_LABEL_RE =
  /^(?:【\s*(?:释义|意思|词性|例句)\s*】|#+\s*(?:释义|意思|词性|例句)|释义|意思|词性|例句)$/i;

const MEANING_SECTION_LINE_RE =
  /^【\s*(释义|词性|例句|意思)\s*】\s*$|^#{1,3}\s*(释义|词性|例句)\s*$/i;

const MEANING_SECTION_PREFIX_RE =
  /^(?:【\s*(?:释义|意思)\s*】|(?:释义|意思))\s*[:：]?\s*/i;

export type JpVocabMeaningAiInput = {
  word: string;
  reading?: string | null;
  kind?: string;
  pos?: string | null;
  /** 缺释义（本接口主任务；默认 true） */
  need_meaning?: boolean;
  /** 同时缺词性时一并要 AI 出词性 */
  need_pos?: boolean;
  /** 同时缺例句时一并要 AI 出常用用法例句 */
  need_examples?: boolean;
};

export function buildJpVocabMeaningAiPrompt(input: JpVocabMeaningAiInput): string {
  const reading = input.reading?.trim();
  const existingPos = input.pos?.trim();
  const needMeaning = input.need_meaning !== false;
  const needPos = Boolean(input.need_pos);
  const needExamples = Boolean(input.need_examples);
  const combo = needPos || needExamples;

  const meta = [
    `词条：${input.word.trim()}`,
    reading ? `读音：${reading}` : null,
    existingPos && !needPos ? `词性：${existingPos}` : null,
    "类型：单词",
    combo
      ? `本次需补：${[
          needMeaning ? "释义" : null,
          needPos ? "词性" : null,
          needExamples ? "例句（常用用法）" : null,
        ]
          .filter(Boolean)
          .join("、")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (!combo) {
    return `${meta}

请为上述日语单词写中文释义，供 N5/N4 初学者复习。

规则（必须遵守）：
1. 只写最常用 1～3 个义项，按常用程度排序：第 1 个最常用，其后用中文分号 ； 连接次常用（例：送る → 送人；送东西）
2. 若该词有多种常用读音（尤其单字词如 前=まえ/ぜん、中=なか/ちゅう），须用半角斜杠 / 分隔不同读音/大义项；斜杠段数须与「读音」字段一致（读音也写 まえ/ぜん 这种形式）
3. 同一大义项下的近义仍用中文分号 ； 连接，例如：前面；以前/前面的；预先的（第一义 まえ，第二义 ぜん）
4. 仅一种读音时：只写 1～3 个近义，用 ； 连接，不要加斜杠，例如：漂亮；干净
5. 不要冷僻义、不要词典全义堆砌；简短口语化，不要例句、不要编号、不要 markdown、不要解释过程
6. 不要输出日语假名或英文（专有名词可保留常见中文译名）
7. 只输出一行中文释义正文（例：很多；大量）。禁止只输出「释义」「【释义】」这类标题壳`;
  }

  // 用「释义：正文」一行式，勿用单独【释义】标题行——模型易只回标题壳写进库
  const sections: string[] = [];
  if (needMeaning) {
    sections.push(
      "释义：一行中文义项（例：很多；大量）。最常用 1～3 个，用「；」连接，常用在前；多读音大义项用半角 /。不要日语假名、不要编号。禁止只写「释义」或「【释义】」。"
    );
  }
  if (needPos) {
    sections.push(
      "词性：一行中文词性（例：名词、动词、い形容词、な形容词、副词；多词性用 /，如 名词/副词）。"
    );
  }
  if (needExamples) {
    sections.push(
      `例句：
只造比较常用的用法（不要冷僻义）。条数：先看释义——含 / 时按斜杠段数（每段 1 句）；无斜杠时 max(2, 常用用法数)。
每条两行：日语一行（句中每个汉字后立刻半角括号假名，如 今日(きょう)）；下一行必须以「译文：」开头的自然中文。
N5～N4 短句口语；必须用到该词条；句末须有「。」等；从句连接（ながら／によると）后加「、」；不要行首编号、不要 markdown、不要句末语法说明括号。`
    );
  }

  return `${meta}

请为上述日语单词补全字段，供 N5/N4 初学者复习。

请严格按下列格式输出（缺哪项就省略哪行；「释义：」「词性：」后必须跟正文，禁止只输出标签）：
${sections.join("\n\n")}

输出示例（有释义+词性时）：
释义：很多；大量
词性：名词/副词

总规则：
- 释义必须是中文义项正文，不是「释义」「【释义】」标题
- 释义不要冷僻义堆砌；例句只要常用用法
- 不要输出解释过程、不要 markdown`;
}

/** 按斜杠拆大义项（不同读音/用法）；无斜杠则整段为一义 */
export function splitJpVocabMeaningMajorSenses(meaning: string | null | undefined): string[] {
  const parts = String(meaning || "")
    .split(/[/／]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [];
}

/** 是否为区块标题等无效「释义」（空字段或字面【释义】） */
export function isJpVocabMeaningMetaLabel(
  meaning: string | null | undefined
): boolean {
  const t = String(meaning ?? "").trim();
  if (!t) return false;
  return MEANING_META_LABEL_RE.test(t);
}

/** 剥掉【释义】标题行 / 同行前缀，避免模型壳写进正文 */
function stripJpVocabMeaningSectionChrome(raw: string): string {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const line of lines) {
    if (MEANING_SECTION_LINE_RE.test(line)) continue;
    const stripped = line.replace(MEANING_SECTION_PREFIX_RE, "").trim();
    if (!stripped || MEANING_META_LABEL_RE.test(stripped)) continue;
    kept.push(stripped);
  }
  return kept.join("\n").trim();
}

/** 规范化单段近义：按 ；/;/,/、 拆开，去重，最多 3 个，再用 ； 拼接 */
function normalizeJpVocabMeaningSubSenses(raw: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const chunk of String(raw || "").split(/[;；、,，|｜]+/)) {
    const item = chunk
      .trim()
      .replace(/^[\d]+[.、．)\]]\s*/, "")
      .replace(/[。.]+$/, "");
    if (!item || seen.has(item) || MEANING_META_LABEL_RE.test(item)) continue;
    seen.add(item);
    parts.push(item);
    if (parts.length >= JP_VOCAB_MEANING_UPLOAD_SPEC.max_senses) break;
  }
  return parts.join(JP_VOCAB_MEANING_UPLOAD_SPEC.sub_separator);
}

/** 规范化：保留 / 大义项；段内用 ； 近义 */
export function normalizeJpVocabMeaningText(raw: string): string {
  const stripped = stripJpVocabMeaningSectionChrome(raw);
  const majorParts = stripped
    .split(/[/／]/)
    .map((chunk) => normalizeJpVocabMeaningSubSenses(chunk))
    .filter(Boolean);
  if (!majorParts.length) return "";
  return majorParts.join(JP_VOCAB_MEANING_UPLOAD_SPEC.major_separator);
}

const HAN_RE = /[\u4E00-\u9FFF]/;
const MARKDOWN_RE = /[`*_#\[\]|>]/;
const MEANING_MAX_LEN = 96;

export function validateJpVocabMeaningAiOutput(
  raw: string
): { ok: true; text: string } | { ok: false; reason: string } {
  if (isJpVocabMeaningMetaLabel(raw)) {
    return { ok: false, reason: "meta_label" };
  }
  const text = normalizeJpVocabMeaningText(raw);
  if (!text) return { ok: false, reason: "empty" };
  if (isJpVocabMeaningMetaLabel(text)) {
    return { ok: false, reason: "meta_label" };
  }
  if (text.length > MEANING_MAX_LEN) return { ok: false, reason: "too_long" };
  if (MARKDOWN_RE.test(text)) return { ok: false, reason: "has_markdown" };
  if (!HAN_RE.test(text)) return { ok: false, reason: "no_chinese" };
  const major = splitJpVocabMeaningMajorSenses(text);
  if (major.length > JP_VOCAB_MEANING_UPLOAD_SPEC.max_major_senses) {
    return { ok: false, reason: "too_many_major_senses" };
  }
  for (const segment of major) {
    const senses = segment
      .split(JP_VOCAB_MEANING_UPLOAD_SPEC.sub_separator)
      .filter(Boolean);
    if (senses.length > JP_VOCAB_MEANING_UPLOAD_SPEC.max_senses) {
      return { ok: false, reason: "too_many_senses" };
    }
  }
  return { ok: true, text };
}

/**
 * 例句条数：释义含 `/` 时按大义项数；无斜杠固定 2。
 * 段内 `；` 只是近义罗列（认真；老实；正经），不是不同用法——勿当条数，
 * 否则 Claude 造 2 句会被误拒 need_four_lines 并触发熔断。
 */
export function countJpVocabExampleSentenceTargetFromMeaning(
  meaning: string | null | undefined,
  kind: string
): number {
  if (kind === "grammar") return 2;
  const major = splitJpVocabMeaningMajorSenses(meaning || "");
  if (major.length >= 2) return major.length;
  return 2;
}
