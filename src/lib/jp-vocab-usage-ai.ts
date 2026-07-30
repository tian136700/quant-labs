import {
  hasJpVocabConnection,
  jpVocabConnectionPromptAppendix,
} from "@/lib/jp-vocab-connection-ai";

/** 日语语法用法上传契约：编号「中文」说明 + 1:1 例句（同一次调用） */

export const JP_VOCAB_USAGE_UPLOAD_SPEC = {
  version: 5,
  count_rule:
    "组数=该语法真实常用用法数（N5～N2）；只有 1 种就 1 组，有几种写几组；禁止硬凑 2 组。每组=中文用法 + 恰好 1 条例句（严格 1:1，禁止多造）；同一次输出末尾必须有【接序】",
  format_example:
    "1. 表示原因、理由：前句说明原因，后句说明结果。(N5)\n今日(きょう)は雨(あめ)だから、家(いえ)にいます。\n译文：今天下雨，所以我待在家里。\n【接序】\n动词原形／一类形容词原形＋「から」\n二类形容词原形／名词＋だから",
  level: "N5～N2（含 N1 以下；不要超纲冷僻用法）",
  rules: [
    "只补「语法」（单词不走此接口）",
    "用法说明必须是中文（学生要看得懂）；禁止整段日语用法；「」外不要写汉字(假名)括注",
    "可在中文里用「」短引日语形态（如「～てから」「て形」）；「」内也不要假名括注",
    "❌ 用法行禁止写接序/接续（接在…、构成「…＋…」、动词辞书形＋…）；接序只写在文末【接序】段",
    "每条用法句末句号后必须标该用法大概 JLPT 等级：半角括号 (N5)/(N4)/(N3)/(N2)/(N1)，紧贴句末",
    "用法与例句必须同一次输出、严格 1:1：编号中文用法下一行立刻跟日语例句，再下一行「译文：」；禁止给同一用法多造几句",
    "例句接续必须对应该条用法：用法写「た形」则例句须た形；写「辞书形／辞書形／る形」则须原形；写「て形」则须て形——禁止把「有时候＋辞书形」的例句挂到「曾经＋た形」用法下",
    "同一次输出末尾必须有【接序】段；接序须写清词类（动词原形／一类形容词原形／二类形容词原形／名词），禁止只写笼统「原形＋」；多用法且接续不同时用「用法1:」「用法2:」分行对应（禁止挤同一行）",
    "禁止拆成「先用法、后例句」两次模型调用；禁止另开定时任务只补接序",
    "组数按真实常用义项：1 种→1 组，2 种→2 组，3 种→3 组；不要为了凑数硬写两组",
    "水平限定 N5～N2：最常用排第一；例句只用简单词、不叠更难语法",
    "不要 markdown、不要给例句再编行首号；等级只写在用法句末括号，不要写「JLPT」「能力考」等字样",
    "写回时请传 source，建议「线上 claude-…」；人手为「手动」；接序可同传 connection",
  ],
  source_examples: ["线上 claude-sonnet-4-6", "本地 gemma4:26b", "手动"],
  reject_reasons: [
    "empty",
    "need_one_point",
    "invalid_numbering",
    "not_grammar",
    "usage_not_chinese",
    "usage_missing_level",
    "usage_off_lemma",
    "usage_has_connection",
    "examples_required",
    "pair_incomplete",
    "examples_invalid",
    "connection_required",
    "connection_invalid",
  ],
} as const;

export type JpVocabUsageAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
  /** 付费/自动写回须句末 (N5)；人手「手动」可省略 */
  requireJlptLevel?: boolean;
};

const NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
const HAN_RE = /[\u4E00-\u9FFF]/;
const FENCE_RE = /^```(?:\w+)?\s*$/;
/** 用法句末等级：。(N5) / （N4）等 → 规范成半角 (N5) */
const JP_VOCAB_USAGE_JLPT_TAIL_RE =
  /^(.*?)[（(]\s*N\s*([1-5])\s*[）)]\s*$/i;
/** 禁止在用法正文里写考试套话（等级只用句末 (N5)） */
const JP_VOCAB_USAGE_EXAM_BOILERPLATE_RE =
  /JLPT|日语能力|能力考|高考|考研/i;
/** 用法行里的假名括注（说明被写成日语了） */
const USAGE_FURIGANA_PAREN_RE = /\([\u3040-\u309Fー]+\)/;

/** 把句末 （N5）/ ( N4 ) 规范成 `(N5)`；没有则 null */
export function normalizeJpVocabUsageJlptTail(
  text: string
): string | null {
  const t = String(text || "").trim();
  const m = JP_VOCAB_USAGE_JLPT_TAIL_RE.exec(t);
  if (!m) return null;
  const body = m[1].replace(/\s+$/u, "");
  if (!body) return null;
  return `${body}(N${m[2]})`;
}

/**
 * 「て形变形 / 动词变ます形规则 / ない形变化规则」等活用教学词条：
 * 学生记怎么变，不需要「用法」；只给 2～3 条 N5 例句。
 */
export function isJpVocabConjugationGrammar(word: string): boolean {
  const w = String(word || "").trim();
  if (!w) return false;
  // 句型用法（～てから）不是「变形规则」课
  if (/^[～~〜]/.test(w)) return false;
  return /变形|变化规则|形规则|变ます|変ます|ます形规则|活用规则|活用变形|ない形|て形|た形|辞書形|变否定|变过去|过去式规则|否定形规则/.test(
    w
  );
}

/**
 * 语法「用法+例句+接序」是否已齐。
 * 活用变形课：不要接序；有例句即算完成（勿再进 list_missing，否则会卡死队列）。
 */
export function isJpVocabGrammarUsageExamplesPairComplete(
  word: string,
  usage: string | null | undefined,
  examples: string | null | undefined,
  connection?: string | null | undefined
): boolean {
  const hasExamples = Boolean(String(examples ?? "").trim());
  const hasUsage = Boolean(String(usage ?? "").trim());
  if (isJpVocabConjugationGrammar(word)) {
    return hasExamples;
  }
  if (!hasJpVocabConnection(connection)) return false;
  return hasUsage && hasExamples;
}

/**
 * 用法说明是否「不像中文」：
 * - 只看「」短引之外：出现 漢字(かな) 或假名过多 → 拒（整段日语）
 * - 「」内可短引日语形态；引号外允许少量假名（如「て形」写作习惯）
 */
export function jpVocabUsageLineLooksNonChinese(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return true;
  const noQuotes = t.replace(/「[^」]*」/g, "").replace(/"[^"]*"/g, "");
  if (USAGE_FURIGANA_PAREN_RE.test(noQuotes)) return true;
  const kana = noQuotes.match(/[\u3040-\u30FFー]/g) || [];
  return kana.length >= 8;
}

/**
 * 语法：用法+例句同一次输出（1:1）。
 * 禁止拆成两次模型调用。用法必须中文。
 * 「变形/变化规则」词条走短标签模式，禁止长篇规则讲解。
 */
export function buildJpVocabUsageAiPrompt(input: JpVocabUsageAiInput): string {
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const word = input.word.trim();
  const isConjugation = isJpVocabConjugationGrammar(word);
  const grammarCore = word
    .replace(/^[～~〜]+/, "")
    .replace(/[～~〜]+$/, "");
  const meta = [
    `词条：${word}`,
    !isConjugation && grammarCore
      ? `语法点：句中例句必须自然出现「${grammarCore}」（词条里的「～」「〜」禁止写进例句）。中文教学标题（如「て形变形」）不要求原文照抄。`
      : isConjugation
        ? `说明：本条是动词/形容词「活用变形」教学，学生会自己回答怎么变；不要写长篇规则讲解。`
        : null,
    reading ? `读音：${reading}` : null,
    meaning ? `旧释义参考（可忽略）：${meaning}` : null,
    "类型：语法",
  ]
    .filter(Boolean)
    .join("\n");

  if (isConjugation) {
    return `${meta}

请为上述「变形/变化规则」词条写例句，供中文母语的 N5 初学者朗读。

硬规则（必须遵守）：
- ❌ 禁止任何「用法」「规则讲解」「标签」「1. 五段动词…」这类中文说明。学生自己记怎么变，你只给例句。
- ❌ 变形课不要写「接序」段（接续形态由课堂规则讲解，卡片只展示例句）。
- ✅ 只输出 2～3 条完整短日语例句；每条下一行「译文：」+ 中文。
- 不要行首编号、不要 markdown、不要总标题、不要箭头对照句（書く→書きます）。
- 例句必须 N5 左右：极短、口语、日常词；必须自然用到本变形（如ます形出现「ます」、て形出现「て」连接）。
- 每个汉字后半角括号假名。

输出格式示例（只有例句，没有用法、没有接序）：
今日(きょう)は学校(がっこう)へ行(い)きます。
译文：今天去学校。
朝(あさ)ご飯(はん)を食(た)べます。
译文：吃早饭。
友(とも)達(だち)と勉強(べんきょう)します。
译文：和朋友一起学习。`;
  }

  return `${meta}

请为上述日语语法一次写完「用法 + 例句 + 接序」，供中文母语的 N5～N2 学习者复习。

硬规则（必须遵守）：
- 同一次输出里完成：每条用法下面立刻跟恰好 1 条例句（日语 + 译文）；文末必须有【接序】。禁止只写用法、禁止只写例句、禁止拆成两轮、禁止另开任务只补接序。
- 严格 1:1：有几条编号用法就几条例句；❌ 禁止给某一用法多造几句（多造会导致卡片错挂，如辞书形例句出现在た形用法下）。
- 例句接续必须对应该条用法本身：用法写「た形／曾经」→ 例句须た形；写「辞书形／辞書形／る形／有时候」→ 例句须原形；写「て形」→ 须て形。不要张冠李戴。
- 组数 = 该语法真实常用用法数（约 N5～N2 / 考试常见）：只有 1 种就写 1 组；有 2 种写 2 组；有 3 种写 3 组。禁止为了凑数硬写两组。
- 用法说明必须是中文，学生要看得懂。❌ 禁止整段日语用法；❌「」外不要写 漢字(かな) 假名括注。可在中文里用「」短引日语形态（如「冷たい」「～てから」「場所に＋名詞がある」），「」内也不要假名括注。
- ❌ 用法行禁止写接序清单（如「动词て形＋本语法」）；接序只放在文末【接序】段。
- ❌ 用法禁止写「接在…之后」「构成「…＋…」」等接续说明；这些只写在【接序】。
- 每条中文用法在句末句号后，必须紧跟该用法大概对应的 JLPT 等级，半角括号：。(N5) 或 .(N4) .(N3) .(N2) .(N1)。按该条用法的常见考试难度估，不要整词条只标一个级；不要写「JLPT」「能力考」等字样。
- 只用本词条本身的用法。❌ 禁止把其它语法点塞进来凑组数（词条「～がある」时，不要写「～たことがある」「～ことがある」等别的句型当独立用法；那些是别的词条）。
- 每一组必须完整：中文用法（含句末等级） + 日语例句 + 译文：；禁止只输出用法。
- 例句才是日语：简单词；不要再叠另一个更难的语法；每个汉字后半角括号假名；「译文：」后中文。
- 不要 markdown、不要给例句再编行首号。
- 不要写总标题；第一行就必须是「1. …」中文用法。
${jpVocabConnectionPromptAppendix("grammar")}

输出格式示例（仅 1 种常用用法时就只输出 1 组；多种用法再继续 2. 3. …；末尾接序）：
1. 表示原因、理由：前句说明原因，后句说明结果。(N5)
今日(きょう)は雨(あめ)だから、家(いえ)にいます。
译文：今天下雨，所以我待在家里。
【接序】
动词原形／一类形容词原形＋「から」
二类形容词原形／名词＋だから`;
}

export type JpVocabGrammarUsageExamplePairParsed = {
  usage: string;
  example_sentences: string;
};

/**
 * 变形课：只解析「日语 + 译文」块；usage 固定空串。
 * 若模型仍输出「1. 中文用法」则失败（应拒后重试）。
 */
export function parseJpVocabConjugationExamplesOnly(
  raw: string
): JpVocabGrammarUsageExamplePairParsed | null {
  const lines = stripFenceNoise(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  // 变形禁止「1. 中文用法」行（含句末 (N5) 的中文说明）
  for (const line of lines) {
    const m = NUMBERED_LINE_RE.exec(line);
    if (!m) continue;
    const body = m[2].trim();
    // 编号行若主要是中文说明（汉字多、假名括注少）→ 当作违规用法行
    if (HAN_RE.test(body) && !USAGE_FURIGANA_PAREN_RE.test(body)) {
      const kana = body.match(/[\u3040-\u30FFー]/g) || [];
      if (kana.length < 8) return null;
    }
  }

  const exampleLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    // 跳过误加的纯数字编号行「1.」空内容已在 NUMBERED 处理
    let jp = lines[i];
    const numbered = NUMBERED_LINE_RE.exec(jp);
    if (numbered) {
      // 编号后直接是日语例句（少见）：剥掉编号
      jp = numbered[2].trim();
    }
    i += 1;
    if (i >= lines.length) return null;
    const gloss = lines[i];
    if (!/^(译文|譯文)\s*[：:]/.test(gloss)) return null;
    exampleLines.push(jp, gloss);
    i += 1;
  }
  if (exampleLines.length < 4 || exampleLines.length > 6) return null;
  // 2～3 组 → 4～6 行
  return { usage: "", example_sentences: exampleLines.join("\n") };
}

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
  const cleaned = stripJpVocabUsageConnectionNoise(String(raw ?? ""));
  const points = parseJpVocabUsagePoints(cleaned);
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
  const cleaned = stripJpVocabUsageConnectionNoise(String(raw ?? ""));
  const points = parseJpVocabUsagePoints(cleaned);
  if (!points?.length) return cleaned.trim();
  return points
    .map((p, i) => `${jpVocabUsagePairLabel(i + 1)}：${p.text}`)
    .join("\n");
}

/**
 * 用法行是否夹带接序/接续说明（应只出现在 connection 字段）。
 * 例：「接在动词辞书形…」「构成「动词辞书形＋前に」」
 */
/**
 * 是否「纯接续公式句」：句首就是词类/可接…，不是义项说明。
 * 义项里提到「た形＋とき」表示时间关系 → 不算噪音（～とき 用法2）。
 */
function jpVocabUsageSentenceIsConnectionFormula(s: string): boolean {
  const t = String(s || "").trim();
  if (!t) return false;
  if (/^接在/.test(t)) return true;
  if (/^构成「/.test(t)) return true;
  if (/^接续/.test(t)) return true;
  if (/^(?:前接|后接)/.test(t)) return true;
  if (/^(?:可)?接(?:在)?(?:动词|名词|一类|二类|い|な|形容词)/.test(t)) {
    return true;
  }
  // 句首词类 + 活用形＋…（如「动词た形＋とき」整句公式）
  if (
    /^(?:动词|名词|一类|二类|い形容|な形容|形容词)/.test(t) &&
    /[＋+]/.test(t) &&
    /(?:辞书形|て形|た形|ます形|普通形|词干)/.test(t)
  ) {
    return true;
  }
  return false;
}

export function jpVocabUsageLineHasConnectionNoise(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/接在/.test(t)) return true;
  if (/构成「[^」]*[＋+]/.test(t)) return true;
  if (/接续(?:形态|方式|方法|规则)?/.test(t)) return true;
  if (/(?:前接|后接)(?:动词|形容词|名词|一类|二类)/.test(t)) return true;
  // 「…。可接动词…」夹带；或整段以公式句开头
  if (/(?:^|[。！？])\s*(?:可)?接(?:在)?(?:动词|名词|一类|二类|い|な)/.test(t)) {
    return true;
  }
  // 勿把「表达…た形＋とき 表示…」义项整段判成噪音
  const body = t.replace(JP_VOCAB_USAGE_JLPT_TAIL_RE, "$1").trim();
  if (jpVocabUsageSentenceIsConnectionFormula(body)) return true;
  return false;
}

/** 剥掉单条用法正文里的接续噪音，保留义项与句末 (N5) */
export function stripJpVocabUsageConnectionNoiseFromLine(text: string): string {
  let t = String(text || "").trim();
  if (!t) return "";

  const levelMatch = JP_VOCAB_USAGE_JLPT_TAIL_RE.exec(t);
  let body = levelMatch ? levelMatch[1].replace(/\s+$/u, "") : t;
  const level = levelMatch ? `(N${levelMatch[2]})` : "";

  // 先按句号切开：整句是接续公式则丢掉；义项里提「た形＋とき」要保留
  const sentences = body.split(/(?<=[。！？])/u);
  const keptSentences: string[] = [];
  for (const rawSent of sentences) {
    const s = rawSent.trim();
    if (!s) continue;
    if (jpVocabUsageSentenceIsConnectionFormula(s)) continue;
    keptSentences.push(s);
  }
  body = keptSentences.join("");

  // 同一句内夹带：「…，接在…，构成…。」→ 剥子句（不剥「表示…た形＋とき」义项）
  body = body
    .replace(/[，、；;]?\s*接在[^。！？]*/gu, "")
    .replace(/[，、；;]?\s*构成「[^」]*」(?:或「[^」]*」)*/gu, "")
    .replace(/[，、；;]?\s*接续(?:形态|方式|方法|规则)?[^。！？]*/gu, "")
    .replace(
      /[，、；;]?\s*(?:前接|后接)(?:动词|形容词|名词|一类|二类)[^。！？]*/gu,
      ""
    )
    .replace(
      /[，、；;]?\s*(?:可)?接(?:在)?(?:动词|名词|一类|二类|い|な|形容词)[^。！？]*/gu,
      ""
    );

  body = body
    .replace(/[，、；;\s]+$/u, "")
    .replace(/^[，、；;\s]+/u, "")
    .trim();
  if (body && !/[。！？]$/u.test(body)) body = `${body}。`;

  if (!body) return level;
  return level ? `${body}${level}` : body;
}

/**
 * 剥掉整段编号用法里的接续噪音（展示 / 写回共用）。
 * 编号解析失败时按单段处理。
 */
export function stripJpVocabUsageConnectionNoise(
  raw: string | null | undefined
): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const points = parseJpVocabUsagePoints(text);
  if (!points?.length) {
    return stripJpVocabUsageConnectionNoiseFromLine(text);
  }
  return serializeJpVocabUsagePoints(
    points.map((p) => ({
      n: p.n,
      text: stripJpVocabUsageConnectionNoiseFromLine(p.text),
    }))
  );
}

/**
 * 用法是否「跑题」到其它语法点（例：词条～がある 却写 たことがある）。
 */
export function jpVocabGrammarUsageOffLemma(
  word: string,
  usageBody: string
): boolean {
  const core = String(word || "")
    .replace(/^\s*\d+\.\s*/, "")
    .replace(/[～~〜\s]/g, "")
    .trim();
  const body = String(usageBody || "");
  if (!core || !body) return false;
  // ～がある：禁止把「たことがある／ことがある」写成独立用法
  if (core === "がある" || core.endsWith("がある")) {
    if (/たことがある/.test(body)) return true;
    if (/ことがある/.test(body) && !/ものがある|ことがあるが/.test(body)) {
      // 「ことがある」作语法核（非「が」存在句）
      return true;
    }
  }
  return false;
}

export function validateJpVocabUsageAiOutput(
  raw: string,
  input?: JpVocabUsageAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  if (input && input.kind !== "grammar") {
    return { ok: false, reason: "not_grammar" };
  }
  // 先剥接续噪音，再校验（存量/模型常把接序写进用法）
  const text = stripJpVocabUsageConnectionNoise(String(raw ?? "")).trim();
  if (!text) return { ok: false, reason: "empty" };
  // 先挡日语用法（含假名括注），再解析编号
  for (const line of text.split(/\r?\n/)) {
    const m = NUMBERED_LINE_RE.exec(line.trim());
    const body = m ? m[2].trim() : line.trim();
    if (body && jpVocabUsageLineLooksNonChinese(body)) {
      return { ok: false, reason: "usage_not_chinese" };
    }
    if (body && jpVocabUsageLineHasConnectionNoise(body)) {
      return { ok: false, reason: "usage_has_connection" };
    }
    if (input?.word && body && jpVocabGrammarUsageOffLemma(input.word, body)) {
      return { ok: false, reason: "usage_off_lemma" };
    }
    if (body && JP_VOCAB_USAGE_EXAM_BOILERPLATE_RE.test(body)) {
      return { ok: false, reason: "usage_missing_level" };
    }
  }
  const points = parseJpVocabUsagePoints(text);
  if (!points) return { ok: false, reason: "invalid_numbering" };
  if (points.length < 1) return { ok: false, reason: "need_one_point" };
  const requireLevel = input?.requireJlptLevel !== false;
  const withLevel: { n: number; text: string }[] = [];
  for (const p of points) {
    const cleaned = stripJpVocabUsageConnectionNoiseFromLine(p.text);
    if (!cleaned || jpVocabUsageLineHasConnectionNoise(cleaned)) {
      return { ok: false, reason: "usage_has_connection" };
    }
    const normalized = normalizeJpVocabUsageJlptTail(cleaned);
    if (normalized) {
      withLevel.push({ n: p.n, text: normalized });
      continue;
    }
    if (requireLevel) {
      return { ok: false, reason: "usage_missing_level" };
    }
    withLevel.push({ n: p.n, text: cleaned.trim() });
  }
  return { ok: true, text: serializeJpVocabUsagePoints(withLevel) };
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

  if (input?.word && isJpVocabConjugationGrammar(input.word)) {
    const conj = parseJpVocabConjugationExamplesOnly(text);
    if (!conj) return { ok: false, reason: "pair_incomplete" };
    return {
      ok: true,
      usage: "",
      example_sentences: conj.example_sentences,
    };
  }

  const parsed = parseJpVocabGrammarUsageExamplePairs(text);
  if (!parsed) {
    // 拆对失败时区分：日语用法 vs 结构不全
    const numbered = text
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
