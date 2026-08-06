/**
 * 读音/形态「对比区别」语法（如 何（なん／なに））：
 * 不是拆成多条「1.用法」，而是先写【区别】，再两侧各一组对照例句。
 */

const NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
const DISTINCTION_MARKERS = ["【区别】", "【區別】", "【對比】", "【对比】"] as const;
/** 假名形态分隔：／ / ・ · 、 */
const CONTRAST_FORM_SEP = String.raw`[／\/・·、]`;
const KANA_FORM = String.raw`[\u3040-\u309Fー]+`;
const KANA_FORM_MIN2 = String.raw`[\u3040-\u309Fー]{2,}`;
const CONTRAST_FORM_CHAIN_RE = new RegExp(
  `${KANA_FORM}(?:${CONTRAST_FORM_SEP}${KANA_FORM})+`,
  "u"
);
const CONTRAST_FORM_CHAIN_MIN2_RE = new RegExp(
  `${KANA_FORM_MIN2}(?:${CONTRAST_FORM_SEP}${KANA_FORM_MIN2})+`,
  "u"
);
const JP_SURFACE_TOKEN_RE = /^[\u3040-\u30FF\u4E00-\u9FFF々ー]+$/u;
const CONTRAST_META_WORD_RE = /区别|區別|对比|對比|辨析|違い|用法/u;

/** 标题/读音里用「／」并列假名形态，或标题含「区别/对比/辨析」 */
export function isJpVocabContrastGrammar(
  word: string,
  reading?: string | null
): boolean {
  const w = String(word || "").trim();
  const r = String(reading || "").trim();
  if (!w && !r) return false;
  // 活用变形课优先走变形格式，不抢
  if (/变形|变化规则|形规则|变ます|変ます|ます形规则|活用规则/.test(w)) {
    return false;
  }
  const blob = `${w}\n${r}`;
  if (CONTRAST_FORM_CHAIN_RE.test(blob)) return true;
  if (/区别|对比|対比|辨析/.test(w)) return true;
  return false;
}

/** 从「なに／なん」或「あげる／くれる／もらう」一类串拆出形态列表 */
export function splitJpVocabContrastFormChain(raw: string): string[] | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  const parts = t
    .split(new RegExp(CONTRAST_FORM_SEP, "u"))
    .map((p) => p.trim())
    .filter((p) => new RegExp(`^${KANA_FORM}$`, "u").test(p));
  if (parts.length < 2) return null;
  return preferContrastFormsOrder(parts);
}

/**
 * 混合表记（如「お元気で／お大事に」）也能拆成对比侧；
 * 防止回退正则误抽到「で／お」这类 1 字碎片。
 */
function splitJpVocabContrastSurfaceChain(raw: string): string[] | null {
  const t = String(raw || "").trim();
  if (!t || !new RegExp(CONTRAST_FORM_SEP, "u").test(t)) return null;
  const parts = t
    .split(new RegExp(CONTRAST_FORM_SEP, "u"))
    .map((p) =>
      p
        .trim()
        .replace(/^[「『（(]+/u, "")
        .replace(/[」』）)]+$/u, "")
    )
    .filter((p) => p.length >= 2)
    .filter((p) => JP_SURFACE_TOKEN_RE.test(p))
    .filter((p) => !CONTRAST_META_WORD_RE.test(p));
  if (parts.length < 2) return null;
  return preferContrastFormsOrder(parts);
}

/** 从标题 / reading 抽出对比形态，如 ["なに","なん"] 或 ["くれる","もらう"] */
export function parseJpVocabContrastForms(
  word: string,
  reading?: string | null
): string[] | null {
  const r = String(reading || "").trim();
  const fromReading = splitJpVocabContrastFormChain(r);
  if (fromReading) return fromReading;

  const w = String(word || "").trim();
  const wCore = w
    .replace(/(?:の)?(?:区别|區別|对比|對比|辨析|違い|用法)\s*$/u, "")
    .trim();
  const fromWordSurface = splitJpVocabContrastSurfaceChain(wCore || w);
  if (fromWordSurface) return fromWordSurface;
  const mParen = new RegExp(
    `[（(][^）)]*?(${KANA_FORM_MIN2}(?:${CONTRAST_FORM_SEP}${KANA_FORM_MIN2})+)[^）)]*[）)]`,
    "u"
  ).exec(w);
  if (mParen) {
    const fromParen = splitJpVocabContrastFormChain(mParen[1]);
    if (fromParen) return fromParen;
  }

  // 词条本体：くれる／もらう、あげる・くれる・もらうの区别
  const mEmbed = new RegExp(
    `(${KANA_FORM_MIN2}(?:${CONTRAST_FORM_SEP}${KANA_FORM_MIN2})+)`,
    "u"
  ).exec(wCore || w);
  if (mEmbed) {
    const fromEmbed = splitJpVocabContrastFormChain(mEmbed[1]);
    if (fromEmbed) return fromEmbed;
  }
  return null;
}

/** 教学顺序：なに 先于 なん；其它保持原序 */
function preferContrastFormsOrder(parts: string[]): string[] {
  if (
    parts.length === 2 &&
    ((parts[0] === "なん" && parts[1] === "なに") ||
      (parts[0] === "なに" && parts[1] === "なん"))
  ) {
    return ["なに", "なん"];
  }
  return parts;
}

export function splitJpVocabUsageDistinctionLead(raw: string): {
  lead: string | null;
  body: string;
} {
  const text = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return { lead: null, body: "" };

  let rest = text;
  let hadMarker = false;
  for (const marker of DISTINCTION_MARKERS) {
    if (rest.startsWith(marker)) {
      rest = rest.slice(marker.length).replace(/^\s+/, "");
      hadMarker = true;
      break;
    }
  }

  const lines = rest.split("\n");
  const firstNumbered = lines.findIndex((ln) =>
    NUMBERED_LINE_RE.test(ln.trim())
  );
  if (firstNumbered < 0) {
    if (hadMarker) return { lead: rest || null, body: "" };
    return { lead: null, body: text };
  }
  if (firstNumbered === 0) {
    return { lead: null, body: hadMarker ? rest : text };
  }
  if (!hadMarker && NUMBERED_LINE_RE.test(lines[0]?.trim() || "")) {
    return { lead: null, body: text };
  }

  const leadLines = lines
    .slice(0, firstNumbered)
    .map((l) => l.trim())
    .filter(Boolean);
  const body = lines.slice(firstNumbered).join("\n").trim();
  return { lead: leadLines.length ? leadLines.join("\n") : null, body };
}

export function joinJpVocabUsageWithDistinction(
  lead: string | null | undefined,
  numberedBody: string
): string {
  const body = String(numberedBody || "").trim();
  const leadText = String(lead || "").trim();
  if (!leadText) return body;
  if (!body) return `【区别】\n${leadText}`;
  return `【区别】\n${leadText}\n${body}`;
}

/**
 * 对比侧形态 token：须含假名或「～」，禁止把「我方」「得到」等纯中文括注当成读法/形态。
 */
export function isJpVocabContrastFormToken(raw: string): boolean {
  const t = String(raw || "").trim();
  if (!t || t === "—" || t === "-") return false;
  if (/[\u3040-\u309F\u30A0-\u30FFー]/.test(t)) return true;
  if (/^[～〜]/.test(t)) return true;
  return false;
}

/** 从「くれる：…」「「なに」：…」「～てくれる：…」行首抽出形态 */
export function jpVocabContrastFormHeadFromUsageText(
  usageText: string
): string | null {
  const t = String(usageText || "").trim();
  if (!t) return null;
  const quotedHead = /^「([^」]+)」\s*[：:]/u.exec(t);
  if (quotedHead && isJpVocabContrastFormToken(quotedHead[1])) {
    return quotedHead[1];
  }
  const bareHead = /^([～〜]?[^\s：:「」]{1,24})\s*[：:]/u.exec(t);
  if (bareHead && isJpVocabContrastFormToken(bareHead[1])) {
    return bareHead[1];
  }
  return null;
}

/** 正文里第一个合法日语形态括注（跳过「我方」等中文） */
export function jpVocabContrastFormQuoteFromUsageText(
  usageText: string
): string | null {
  const t = String(usageText || "").trim();
  for (const m of t.matchAll(/「([^」]+)」/gu)) {
    if (isJpVocabContrastFormToken(m[1])) return m[1];
  }
  return null;
}

/**
 * 对比侧标签：优先正文「なに」／词条形态；禁止写「对照」（学生看不懂）。
 * 例：1.「くれる」 → 卡片显示「1.「くれる」的例句」
 */
export function jpVocabContrastPairLabel(
  n: number,
  usageText: string,
  forms?: readonly string[] | null
): string {
  const t = String(usageText || "").trim();
  const head = jpVocabContrastFormHeadFromUsageText(t);
  if (head) return `${n}.「${head}」`;
  const quotedJp = jpVocabContrastFormQuoteFromUsageText(t);
  if (quotedJp) return `${n}.「${quotedJp}」`;
  // 1.对照：くれる…
  const stripped = t.replace(
    /^(?:对照|對照|对比|對比|区别|區別)\s*[：:．.]?\s*/u,
    ""
  );
  const kanaHead = new RegExp(`^(${KANA_FORM})`, "u").exec(stripped);
  if (kanaHead) return `${n}.「${kanaHead[1]}」`;
  const form = String(forms?.[n - 1] ?? "").trim();
  if (form && isJpVocabContrastFormToken(form)) return `${n}.「${form}」`;
  return `${n}.侧${n}`;
}

export function buildJpVocabContrastUsageAiPromptAppendix(
  word: string,
  reading?: string | null
): string {
  const forms = parseJpVocabContrastForms(word, reading);
  const a = forms?.[0] ?? "A";
  const b = forms?.[1] ?? "B";
  const more =
    forms && forms.length > 2
      ? `（本条共 ${forms.length} 侧：${forms.map((f) => `「${f}」`).join("、")}；每侧各 1 组）`
      : "";
  return `
本条是「读音/形态对比」课（比较「${a}」与「${b}」的区别），不是句型多义用法课。
卡片会把两侧整理成**表格**（列：何时用 / 接续；形态写在「何时用」开头如「くれる：…」，不要另造「读法」列、不要用「我方」等中文当形态），再在表下展示例句——不要按普通语法写一长串「1.用法 2.用法」。

硬规则（必须遵守）：
- ❌ 禁止按场景拆成 5～7 条「1.用法：…」编号清单（那是句型课格式，不适合本条）。
- ✅ 先用中文概括两者的区别，再分别给两侧各恰好 1 组：何时用「${a}」+ 1 条例句；何时用「${b}」+ 1 条例句。
- ✅ 「何时用」与「接续」各写清楚，便于卡片排进对照表；不要只写散文、不写两侧分行。
- 输出结构必须是：
【区别】
（一段中文：两者分别用在什么地方、各表示什么；句末半角 (N5)/(N4)…）
1. 「${a}」：……时用「${a}」。(N5)
日语例句
译文：…
2. 「${b}」：……时用「${b}」。(N5)
日语例句
译文：…
【接序】
（两侧接续公式；须含「＋」；可用「用法1:」「用法2:」分行）
【出现频率】
口语频率：n
考试频率：n
- 编号用法正文以「「${a}」：」「「${b}」：」开头；必须中文；句末等级括号。
- 严格 2 组、每组恰好 1 条例句；不要 markdown；例句汉字后半角括号假名。
- ❌【接序】禁止夹用法说明（主语是谁、受益者是谁、恩惠流向、必须是第三方、可互换等）——那些只写在【区别】/编号用法；「｜」后只允许接续短注（如「给东西」「帮忙做事」）。
- ❌接序里不要用「が／は」斜杠串助词（会被拆断）；多形态用全角「；」且每段自带「＋」。

输出格式示例：
【区别】
「何」有「なに」与「なん」两种读法：独立发问或后接「の／を／が／も／か」等时多用「なに」；后接数量词或「で／と」时读「なん」。(N5)
1. 「なに」：独立发问，或后接「の」「を」「が」「も」「か」等时用「なに」。(N5)
これはなにですか。
译文：这是什么？
2. 「なん」：后接数量词、「時」「月」「年」或「で」「と」时用「なん」。(N5)
今(いま)、何時(なんじ)ですか。
译文：现在几点？
【接序】
用法1: 独立使用＋なに｜单独发问；名词＋の＋なに｜后接の等
用法2: 数量词＋なん｜问数量；時／月／年＋なん｜问几时几月

授受对比（くれる／もらう）接序样例（只公式，无用法长句）：
用法1: 他人＋が＋我＋に＋名词＋をくれる｜给东西；动词て形＋くれる｜帮忙做事
用法2: 我＋は＋他人＋に＋名词＋をもらう｜得到东西；动词て形＋もらう｜请人做事`;
}
