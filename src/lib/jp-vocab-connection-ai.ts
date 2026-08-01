/**
 * 日语词条「接序」：接续形态说明（动词辞书形／一类・二类形容词／名词等如何接该语法或本词活用）。
 * 与用法/例句同一次模型输出；用法正文禁止再写接序。
 */

export const JP_VOCAB_CONNECTION_SECTION_MARKER = "【接序】";

export const JP_VOCAB_CONNECTION_UPLOAD_SPEC = {
  version: 5,
  label: "接序",
  format_example_grammar:
    "用法1: 动词原形＋と；一类形容词词尾い＋と；二类形容词词干＋だと；名词＋だと（条件句前项不用た形）\n用法2: 动词原形＋と（前后主语可不同；后项客观描述）",
  format_example_word:
    "一类动词／原形：「書く」；ます形：「書きます」；て形：「書いて」",
  rules: [
    "接序单独成段，放在用法/例句之后，以「【接序】」起头",
    "用法说明里禁止再写接序（接续形态）；接序只写在本字段",
    "用中文说明；日语形态用「」短引，禁止 漢字(かな) 假名括注",
    "否定形／疑问形／肯定形等变体必须另起一行（如「否定形: …」「疑问形: …」），禁止和主接续挤同一行",
    "对学生友好：写清词类，如「一类动词／二类动词／三类动词／一类形容词／二类形容词／名词＋本语法」；❌ 禁止只写笼统的「原形＋…」",
    "动词分类只用「一类动词／二类动词／三类动词」（国内教材）；❌ 禁止「五段／一段／カ变／サ变／五段动词／一段动词」",
    "卡片会把复杂接续自动排成表：多种词类时必须用「词类＋接续」并用全角分号「；」串在同一用法下（例：动词原形＋と；一类形容词词尾い＋と；名词＋だと）；或分行「词类：说明」（例：一类动词：…）",
    "❌ 禁止写成散文「接在动词、一类形容词、名词后面」——无法上表，学生难扫读",
    "涉及多种动词接续时优先分行：一类动词: …／二类动词: …／三类动词: …（「来る」「する」）",
    "❌ 禁止把一类／二类／三类塞进同一行括号散文（如「动词意志形（一类动词：く→こう；二类动词：る→よう）＋と思う」）——卡片无法上表；须分行「一类动词：…」",
    "な形容词／名词有特殊接法时，用短句说清（如「不加だ」「加だ」「＋な」「＋の」）",
    "若仍写「动词辞书形」必须写成「动词辞书形（动词原形）」；不要只写「动词辞书形」",
    "语法若有多条编号用法：接序必须按「用法1:」「用法2:」分行写（与上面 1. 2. 用法一一对应）；同一行禁止串写多个「用法N」",
    "各用法接续相同时，可只写共用形态（不必硬凑用法1/2）；有差异则必须分行对应",
    "否定形/注意等共用说明另起一行（如「否定形: …」「注意: …」）",
    "单词：写词类与常用活用（原形/ます形/て形或一类·二类形容词等）",
    "2～6 行即可；不要 markdown、不要行首 1. 2.（用「用法N:」标签）",
    "❌ 禁止用「1. 2. 3.」给接序编号——会整段挂到用法1下，把句末 (N4)/(N5) 与对应例句隔开，看起来像「没标级别」",
  ],
  reject_reasons: [
    "empty",
    "too_short",
    "looks_like_examples",
    "bare_numbered_lines",
    "academic_verb_class_terms",
    "nested_class_colon_prose",
  ],
} as const;

const FENCE_RE = /^```(?:\w+)?\s*$/;
const FURIGANA_PAREN_RE = /\([\u3040-\u309Fー]+\)/;
const GLOSS_LINE_RE = /^(译文|譯文)\s*[：:]/;
/** 接序误用「1. 2.」编号（应写成「用法1:」） */
const CONNECTION_BARE_NUMBERED_LINE_RE = /^\s*(\d+)\s*[.、．)\]]\s*(.+)$/;
/** 已带「（动词原形）」或半角括号的，归一成全角注解（中/日） */
const DONGCI_JISHOKEI_RE =
  /(?:动词辞书形|動詞辞書形)(?:（动词原形）|\(动词原形\))?/g;
/**
 * 专业语法术语（五段/一段/カ变…）→ 国内教材「一类/二类/三类动词」。
 * 学生听不懂「五段」；接序展示与写回统一用教材分类。
 */
const ACADEMIC_VERB_CLASS_DETECT_RE =
  /五段动词|五段|一段动词|カ行変格|サ行変格|カ变动词|サ变动词|カ变|サ变|一段(?=去|词|动|「)/;

export function connectionHasAcademicVerbClassTerms(
  raw: string | null | undefined
): boolean {
  return ACADEMIC_VERB_CLASS_DETECT_RE.test(String(raw ?? ""));
}

/** 展示/normalize：把专业术语改写成一类/二类/三类动词 */
export function rewriteJpVocabConnectionSchoolVerbClassTerms(
  raw: string
): string {
  return String(raw ?? "")
    .replace(/五段动词/g, "一类动词")
    .replace(/五段/g, "一类动词")
    .replace(/一段动词/g, "二类动词")
    .replace(/一段(?=去|词|动|「)/g, "二类动词")
    .replace(/カ行変格|カ变动词|カ变/g, "三类动词")
    .replace(/サ行変格|サ变动词|サ变/g, "三类动词");
}


/**
 * 把接序里的裸「1. / 2.」改成「用法1: / 用法2:」。
 * 否则展示层整段 leftover 挂在第一条用法下，等级与例句被接续墙隔开。
 */
export function rewriteJpVocabConnectionBareNumberedToUsageTags(
  raw: string
): string {
  return String(raw ?? "")
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (/^用法\s*\d+\s*[：:]/.test(t)) return line;
      if (/^(否定形|肯定形|疑问形)\b/.test(t)) return line;
      const m = CONNECTION_BARE_NUMBERED_LINE_RE.exec(t);
      if (!m) return line;
      const n = Number(m[1]);
      const body = String(m[2] ?? "").trim();
      if (!Number.isInteger(n) || n < 1 || !body) return line;
      return `用法${n}: ${body}`;
    })
    .join("\n");
}

/**
 * 「动词辞书形 / 動詞辞書形」一律写成带「（动词原形）」注解；已有则归一、不叠写。
 */
export function formatJpVocabDongciJishokeiLabel(raw: string): string {
  return String(raw ?? "").replace(DONGCI_JISHOKEI_RE, (m) =>
    m.startsWith("動") ? "動詞辞書形（动词原形）" : "动词辞书形（动词原形）"
  );
}

/** 行内「用法1: …。用法2: …」及「否定形／疑问形」拆成多行，便于展示 */
export function expandJpVocabConnectionUsageInlineBreaks(
  raw: string
): string {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\s*(?=用法\s*\d+\s*[：:])/g, "$1\n")
    // 否定形／疑问形／肯定形：带冒号或直接接「～…」
    .replace(/([^\n])\s*(?=(?:否定形|肯定形|疑问形)\s*[：:「])/g, "$1\n")
    // 「……。否定形……」句号后也拆开
    .replace(/([。．])\s*(?=(?:否定形|肯定形|疑问形))/g, "$1\n");
}

export type JpVocabConnectionDisplayParts = {
  /** 第 N 条用法对应的接续正文（不含「用法N:」前缀） */
  byUsageIndex: Record<number, string>;
  /** 无法挂到某条用法的剩余行（如否定形） */
  leftover: string[];
  /** 是否出现过「用法N:」标签 */
  hasUsageTagged: boolean;
  normalized: string | null;
};

/**
 * 把接序拆成「按用法编号」+「剩余行」。
 * 无用法标签时：整段进 leftover（由展示层挂到第一条用法下）。
 */
export function parseJpVocabConnectionDisplayParts(
  raw: string | null | undefined
): JpVocabConnectionDisplayParts {
  const normalized = normalizeJpVocabConnectionText(raw);
  const empty: JpVocabConnectionDisplayParts = {
    byUsageIndex: {},
    leftover: [],
    hasUsageTagged: false,
    normalized: null,
  };
  if (!normalized) return empty;

  const byUsageIndex: Record<number, string> = {};
  const leftover: string[] = [];
  let hasUsageTagged = false;
  const usageLineRe = /^用法\s*(\d+)\s*[：:]\s*(.*)$/;

  for (const line of normalized.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const m = usageLineRe.exec(t);
    if (m) {
      hasUsageTagged = true;
      const idx = Number(m[1]);
      const body = String(m[2] ?? "").trim();
      if (Number.isInteger(idx) && idx > 0 && body) {
        byUsageIndex[idx] = byUsageIndex[idx]
          ? `${byUsageIndex[idx]}\n${body}`
          : body;
      }
      continue;
    }
    leftover.push(t);
  }

  return { byUsageIndex, leftover, hasUsageTagged, normalized };
}

export type JpVocabConnectionTableRow = {
  /** 左列：词类 / 形态标签 */
  label: string;
  /** 右列：接续说明 */
  body: string;
};

const CONNECTION_TABLE_ROW_RE = /^(.+?)[：:]\s*(.+)$/;
/** 「用法1:」留给按用法分挂，不进词类表 */
const CONNECTION_USAGE_TAG_RE = /^用法\s*\d+\s*$/;
/** 词类列上限（含「动词普通形（原形／…）」） */
const CONNECTION_TABLE_LABEL_MAX = 36;
/** 「词类＋接续」段：左标签 + 全角/半角加号起的接续 */
const CONNECTION_PLUS_SEGMENT_RE = /^(.+?)([＋+].+)$/;

/** 按 ； 拆段，但不拆全角/半角括号内的顿号（如「前后主语可不同；后项…」） */
export function splitJpVocabConnectionSemicolonOutsideParens(
  text: string
): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of String(text ?? "")) {
    if (ch === "（" || ch === "(") depth += 1;
    else if (ch === "）" || ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "；" || ch === ";")) {
      const t = buf.trim();
      if (t) parts.push(t);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const last = buf.trim();
  if (last) parts.push(last);
  return parts;
}

/** 括号内「一类动词：…；二类动词：…」可上表的词类标签 */
const CONNECTION_NESTED_CLASS_LABEL_RE =
  /^(一类动词|二类动词|三类动词|一类形容词|二类形容词|名词)\b/;

/**
 * 单行「…（一类动词：…；二类动词：…）＋接续」→ 分行表行；否则 null。
 * 例：动词意志形（一类动词：く→こう；二类动词：る→よう）＋と思う
 */
export function expandJpVocabConnectionNestedClassColonLine(
  line: string
): string[] | null {
  const t = String(line ?? "").trim().replace(/[。．]+$/u, "");
  if (!t) return null;
  const m = /^(.+?)[（(](.+)[）)]\s*([＋+].+)$/.exec(t);
  if (!m) return null;
  const prefix = String(m[1] ?? "").trim();
  const inner = String(m[2] ?? "").trim();
  const suffix = String(m[3] ?? "")
    .trim()
    .replace(/^[+]/, "＋");
  if (!prefix || !inner || !suffix) return null;
  // 括号内须能拆出 ≥2 个「词类：说明」
  const segments = splitJpVocabConnectionSemicolonOutsideParens(inner);
  if (segments.length < 2) return null;
  const parsed: JpVocabConnectionTableRow[] = [];
  for (const seg of segments) {
    const cm = CONNECTION_TABLE_ROW_RE.exec(seg.trim());
    if (!cm) return null;
    const label = String(cm[1] ?? "").trim();
    const body = String(cm[2] ?? "").trim();
    if (!label || !body) return null;
    if (!CONNECTION_NESTED_CLASS_LABEL_RE.test(label)) return null;
    if (label.length > CONNECTION_TABLE_LABEL_MAX) return null;
    const lastRow = parsed[parsed.length - 1];
    if (lastRow && lastRow.label === label) {
      lastRow.body = `${lastRow.body}；${body}`;
    } else {
      parsed.push({ label, body });
    }
  }
  if (parsed.length < 2) return null;

  // 「动词意志形」→ 形态提示「意志形」，写入各行说明括号
  const formHint = prefix.replace(/^动词/, "").trim();
  const useFormHint =
    formHint.length > 0 &&
    formHint.length <= 12 &&
    /形$|形（|意志|假定|可能|命令|使役|被动|受身|て|た|ば/.test(formHint);

  return parsed.map(({ label, body }) => {
    let right = body;
    if (useFormHint && !right.includes(formHint)) {
      right = `${formHint}（${body}）`;
    }
    if (!/[＋+]/.test(right)) {
      right = `${right}${suffix}`;
    }
    return `${label}：${right}`;
  });
}

export function connectionHasNestedClassColonProse(
  raw: string | null | undefined
): boolean {
  for (const line of String(raw ?? "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (expandJpVocabConnectionNestedClassColonLine(t)) return true;
  }
  return false;
}

/**
 * 嵌套词类散文 → 分行「词类：说明」；引用说明句升为「注意：…」便于上表。
 */
export function rewriteJpVocabConnectionNestedClassColonProse(
  raw: string
): string {
  const out: string[] = [];
  for (const line of String(raw ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const expanded = expandJpVocabConnectionNestedClassColonLine(t);
    if (expanded) {
      out.push(...expanded);
      continue;
    }
    // 「～ようと思っている」表示… → 注意：…
    if (
      /^[「『]/.test(t) &&
      /表示|比|强调|语气|意为/.test(t) &&
      !CONNECTION_TABLE_ROW_RE.test(t)
    ) {
      out.push(`注意：${t.replace(/[。．]+$/u, "")}`);
      continue;
    }
    out.push(t);
  }
  return out.join("\n");
}

function tryParseColonConnectionTableRows(
  text: string
): JpVocabConnectionTableRow[] | null {
  const rows: JpVocabConnectionTableRow[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const m = CONNECTION_TABLE_ROW_RE.exec(t);
    if (!m) return null;
    const label = String(m[1] ?? "").trim();
    const body = String(m[2] ?? "").trim();
    if (!label || !body) return null;
    if (CONNECTION_USAGE_TAG_RE.test(label)) return null;
    if (label.length > CONNECTION_TABLE_LABEL_MAX) return null;
    rows.push({ label, body });
  }
  return rows.length >= 2 ? rows : null;
}

/**
 * 「动词原形＋と；一类形容词词尾い＋と；名词＋だと（…）」→ 表行。
 * ≥2 段且每段都能拆成「标签＋接续」才返回。
 */
function tryParseSemicolonPlusConnectionTableRows(
  text: string
): JpVocabConnectionTableRow[] | null {
  const flat = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("；");
  if (!/[；;]/.test(flat) || !/[＋+]/.test(flat)) return null;
  const segments = splitJpVocabConnectionSemicolonOutsideParens(flat);
  if (segments.length < 2) return null;
  const rows: JpVocabConnectionTableRow[] = [];
  for (const seg of segments) {
    const m = CONNECTION_PLUS_SEGMENT_RE.exec(seg);
    if (!m) return null;
    const label = String(m[1] ?? "").trim();
    const body = String(m[2] ?? "").trim().replace(/^[+]/, "＋");
    if (!label || !body) return null;
    if (CONNECTION_USAGE_TAG_RE.test(label)) return null;
    if (label.length > CONNECTION_TABLE_LABEL_MAX) return null;
    // 避免把整句说明误当表（标签里不该再有句号长文）
    if (/[。．]/.test(label)) return null;
    rows.push({ label, body });
  }
  return rows.length >= 2 ? rows : null;
}

/**
 * 复杂接续拆成表格行：
 * 1) 多行「词类：说明」（如 ～ば）
 * 2) 同行「词类＋接续；…」（如 ～と）
 * ≥2 行/段才返回；否则 null（展示层用纯文本）。
 */
export function parseJpVocabConnectionTableRows(
  raw: string | null | undefined
): JpVocabConnectionTableRow[] | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  return (
    tryParseColonConnectionTableRows(text) ??
    tryParseSemicolonPlusConnectionTableRows(text)
  );
}

/** 有编号用法且有接序 → 卡片上接续贴在用法下，不再单独露「接序」块 */
export function jpVocabConnectionShownInlineWithUsage(
  usage: string | null | undefined,
  connection: string | null | undefined
): boolean {
  if (!hasJpVocabConnection(connection)) return false;
  const usageClean = String(usage ?? "").trim();
  if (!usageClean) return false;
  // 延迟 import 会循环；用简单编号检测即可
  return /^\s*\d+\s*[.、．)\]]/m.test(usageClean);
}

export type JpVocabConnectionAiInput = {
  word: string;
  kind: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
};

export function normalizeJpVocabConnectionText(
  raw: string | null | undefined
): string | null {
  const expanded = expandJpVocabConnectionUsageInlineBreaks(
    rewriteJpVocabConnectionBareNumberedToUsageTags(
      rewriteJpVocabConnectionNestedClassColonProse(
        rewriteJpVocabConnectionSchoolVerbClassTerms(String(raw ?? ""))
      )
    )
  );
  const lines = expanded
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== JP_VOCAB_CONNECTION_SECTION_MARKER)
    .filter((line) => !FENCE_RE.test(line))
    .map((line) => formatJpVocabDongciJishokeiLabel(line))
    .map((line) => {
      // 否定形「～X」表示「Y」。→ 否定形: ～X（Y）
      const m = /^(否定形|肯定形|疑问形)\s*[「『]([^」』]+)[」』]\s*表示\s*[「『]([^」』]+)[」』]\s*[。．]?$/.exec(
        line
      );
      if (m) return `${m[1]}: ${m[2]}（${m[3]}）`;
      // 疑问形「～X」用于……。→ 疑问形: ～X（……）
      const mUsed = /^(否定形|肯定形|疑问形)\s*[「『]([^」』]+)[」』]\s*用于\s*(.+?)\s*[。．]?$/.exec(
        line
      );
      if (mUsed) return `${mUsed[1]}: ${mUsed[2]}（${mUsed[3].replace(/[。．]$/, "")}）`;
      // 否定形「～X」。→ 否定形: ～X
      const m2 = /^(否定形|肯定形|疑问形)\s*[「『]([^」』]+)[」』]\s*[。．]?$/.exec(
        line
      );
      if (m2) return `${m2[1]}: ${m2[2]}`;
      // 半角 + → 全角 ＋；句末多余句号（纯公式行）去掉
      let out = line.replace(/\s*\+\s*/g, "＋");
      if (/[＋+]/.test(out) && !/^(否定形|肯定形|疑问形|用法)/.test(out)) {
        out = out.replace(/[。．]+$/u, "");
      }
      return out;
    });
  if (!lines.length) return null;
  return lines.join("\n");
}

export function normalizeJpVocabConnectionSource(
  raw: string | null | undefined
): string | null {
  const t = String(raw ?? "").trim();
  return t || null;
}

export function hasJpVocabConnection(
  connection: string | null | undefined
): boolean {
  return Boolean(normalizeJpVocabConnectionText(connection));
}

/**
 * 从整段模型输出里拆出【接序】段；body 供原有用法/例句解析。
 */
export function splitJpVocabAiOutputConnectionSection(raw: string): {
  body: string;
  connection: string | null;
} {
  const text = String(raw || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return { body: "", connection: null };
  const marker = JP_VOCAB_CONNECTION_SECTION_MARKER;
  const idx = text.indexOf(marker);
  if (idx < 0) {
    return { body: text, connection: null };
  }
  const body = text.slice(0, idx).trim();
  const after = text.slice(idx + marker.length).trim();
  return {
    body,
    connection: normalizeJpVocabConnectionText(after),
  };
}

/** 追加到用法/例句 prompt 末尾的接序硬规则 */
export function jpVocabConnectionPromptAppendix(
  kind: "word" | "grammar"
): string {
  if (kind === "grammar") {
    return `
接序（必须同一次输出，单独成段；卡片会把接续贴在对应「N.用法」下面）：
- 在全部用法与例句写完后，另起一行写「${JP_VOCAB_CONNECTION_SECTION_MARKER}」，下面写接续形态。
- ❌ 禁止把接序写进「用法」行（用法只讲含义/功能，不写「动词て形＋…」这类接续清单）。
- ✅ 上面写了几条编号用法，接序就尽量用「用法1:」「用法2:」…分行对应（与 1. 2. 一一对应）；禁止把「用法1: …。用法2: …」挤在同一行。
- ✅ 各用法接续完全相同时，可只写共用形态，不必硬写用法1/2。
- ✅ 否定形／疑问形／肯定形等变体必须另起一行（如「否定形: …」「疑问形: …」），禁止和主接续挤在同一行。
- ✅ 对学生友好：写清词类：一类动词／二类动词／三类动词／一类形容词原形／二类形容词原形／名词＋本语法；❌禁止只写笼统「原形＋…」；少用「普通形」「现在肯定为词干」；な形容词／名词特殊时用短句（如「不加だ」「加だ」）。
- ✅ 动词只用「一类动词／二类动词／三类动词」（国内教材）；❌禁止「五段／一段／カ变／サ变」。多种动词接续时分行写（一类动词: …／二类动词: …／三类动词: …）。
- ✅ 卡片会自动排表：同一用法下多种词类时，写成「词类＋接续；词类＋接续」（全角「；」），或分行「词类：说明」。❌禁止散文「接在动词、形容词、名词后面」。
- ❌ 禁止「动词意志形（一类动词：…；二类动词：…）＋と思う」这类括号嵌套散文——须分行「一类动词：意志形（…）＋と思う」。
- ✅ 若仍写「动词辞书形」，必须写成「动词辞书形（动词原形）」；日语形态用「」短引，不要假名括注。
- 2～6 行；不要 markdown、不要给接序再编行首 1. 2.。

示例接序段（多用法、接续不同；用法内多词类用「；」便于上表）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
用法1: 动词原形＋と；一类形容词词尾い＋と；二类形容词词干＋だと；名词＋だと（条件句前项不用た形）
用法2: 动词原形＋と（前后主语可不同；后项客观描述）
用法3: 动词普通形（原形／ない形／た形／ている形）＋と；二类形容词词干＋だと；名词＋だと

示例接序段（各用法接续相同 / 活用分行）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
一类动词：词尾う段改え段＋ば（「書く」→「書けば」）
二类动词：去る＋れば（「食べる」→「食べれば」）
三类动词：「来る」→「来れば」；「する」→「すれば」
一类形容词：去い＋ければ

示例接序段（意志形分行上表，如 ～ようと思う）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
一类动词：意志形（く→こう／む→もう等）＋と思う
二类动词：意志形（る→よう）＋と思う
三类动词：「する」→「しよう」；「くる」→「こよう」＋と思う
注意：「～ようと思っている」表示持续意图，比「～ようと思います」更强调当前状态`;
  }
  return `
接序（必须同一次输出，单独成段）：
- 在全部例句写完后，另起一行写「${JP_VOCAB_CONNECTION_SECTION_MARKER}」，下面写本词接序/活用要点。
- ❌ 不要把接序混进例句或译文。
- ✅ 写词类（一类动词／二类动词／三类动词／一类形容词／二类形容词／名词等）及常用形（辞书形、ます形、て形等，按本词需要）；日语用「」短引，不要假名括注。
- ✅ 动词只用「一类／二类／三类」；❌禁止「五段／一段／カ变／サ变」。
- ✅ 若写「动词辞书形」须写成「动词辞书形（动词原形）」。
- 2～4 行即可。

示例接序段：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
一类动词／辞书形（动词原形）：「書く」；ます形：「書きます」；て形：「書いて」`;
}

/** 仅补接序（用法/例句已有） */
export function buildJpVocabConnectionOnlyAiPrompt(
  input: JpVocabConnectionAiInput
): string {
  const reading = input.reading?.trim();
  const meaning = input.meaning?.trim();
  const pos = input.pos?.trim();
  const kindLabel = input.kind === "grammar" ? "语法" : "单词";
  const meta = [
    `词条：${input.word.trim()}`,
    `类型：${kindLabel}`,
    reading ? `读音：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    pos ? `词性：${pos}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (input.kind === "grammar") {
    return `${meta}

请只写该日语语法的「接序」（接续形态），供中文母语 N5～N2 学习者看卡片。
卡片会把「用法N:」接续贴在对应编号用法下面。

硬规则：
- 第一行必须是「${JP_VOCAB_CONNECTION_SECTION_MARKER}」，下面 2～6 行接续说明。
- 若该语法有多条用法且接续不同：必须「用法1:」「用法2:」分行写，禁止挤在同一行。
- 接续相同时可只写共用形态；否定形／疑问形等必须另起一行。
- ✅ 对学生友好：写清词类：一类动词／二类动词／三类动词／一类形容词原形／二类形容词原形／名词＋本语法；❌禁止只写笼统「原形＋…」；少用「普通形」「现在肯定为词干」；な／名词特殊时短句说清（不加だ／加だ）。
- ✅ 动词只用「一类动词／二类动词／三类动词」；❌禁止「五段／一段／カ变／サ变」。多种动词接续时分行写。
- ✅ 卡片自动排表：同一用法多种词类 →「词类＋接续；词类＋接续」；或分行「词类：说明」。❌禁止散文罗列词类。
- ❌ 禁止括号嵌套散文「…（一类动词：…；二类动词：…）＋…」，须分行上表。
- 若仍写「动词辞书形」必须写成「动词辞书形（动词原形）」；日语形态用「」短引；不要假名括注。
- 不要写用法长文、不要写例句、不要 markdown。

输出示例（接续不同；用法内多词类用「；」）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
用法1: 动词原形＋と；一类形容词词尾い＋と；二类形容词词干＋だと；名词＋だと（条件句前项不用た形）
用法2: 动词原形＋と（前后主语可不同；后项客观描述）

输出示例（活用分行上表）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
一类动词：词尾う段改え段＋ば（「書く」→「書けば」）
二类动词：去る＋れば（「食べる」→「食べれば」）
三类动词：「来る」→「来れば」；「する」→「すれば」

输出示例（意志形分行上表）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
一类动词：意志形（く→こう／む→もう等）＋と思う
二类动词：意志形（る→よう）＋と思う
三类动词：「する」→「しよう」；「くる」→「こよう」＋と思う`;
  }

  return `${meta}

请只写该日语单词的「接序」（词类与常用活用），供中文母语 N5～N4 学习者看卡片。

硬规则：
- 第一行必须是「${JP_VOCAB_CONNECTION_SECTION_MARKER}」，下面 2～4 行。
- 写词类与辞书形/ます形/て形等（按本词需要）；动词用一类／二类／三类；❌禁止五段／一段／カ变／サ变；日语用「」短引；不要假名括注。
- 若写「动词辞书形」须写成「动词辞书形（动词原形）」。
- 不要写例句、不要 markdown。

输出示例：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
一类动词／辞书形（动词原形）：「書く」；ます形：「書きます」；て形：「書いて」`;
}

export function validateJpVocabConnectionAiOutput(
  raw: string,
  _input?: JpVocabConnectionAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  let text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
  // 写回前若仍是裸「1. 2.」——先拒，逼模型改用「用法N:」（normalize 展示层仍会兜底改写）
  const preCheckBody = text.includes(JP_VOCAB_CONNECTION_SECTION_MARKER)
    ? text.slice(
        text.indexOf(JP_VOCAB_CONNECTION_SECTION_MARKER) +
          JP_VOCAB_CONNECTION_SECTION_MARKER.length
      )
    : text;
  const preLines = preCheckBody
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l !== JP_VOCAB_CONNECTION_SECTION_MARKER);
  const bareHits = preLines.filter((l) =>
    CONNECTION_BARE_NUMBERED_LINE_RE.test(l)
  ).length;
  if (bareHits >= 2) {
    return { ok: false, reason: "bare_numbered_lines" };
  }
  // 写回拒专业术语：学生教材用一类/二类/三类，听不懂五段/カ变
  if (connectionHasAcademicVerbClassTerms(preCheckBody)) {
    return { ok: false, reason: "academic_verb_class_terms" };
  }
  // 写回拒括号嵌套词类散文（须分行才能上表）；normalize 仍会改写存量展示
  if (connectionHasNestedClassColonProse(preCheckBody)) {
    return { ok: false, reason: "nested_class_colon_prose" };
  }
  if (text.includes(JP_VOCAB_CONNECTION_SECTION_MARKER)) {
    text =
      splitJpVocabAiOutputConnectionSection(text).connection ??
      normalizeJpVocabConnectionText(text) ??
      "";
  } else {
    text = normalizeJpVocabConnectionText(text) ?? "";
  }
  if (!text) return { ok: false, reason: "empty" };
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 1) return { ok: false, reason: "too_short" };
  // 误把整段例句当成接序
  const glossHits = lines.filter((l) => GLOSS_LINE_RE.test(l)).length;
  if (glossHits >= 2) return { ok: false, reason: "looks_like_examples" };
  const furiganaHits = lines.filter((l) => FURIGANA_PAREN_RE.test(l)).length;
  if (furiganaHits >= 2) return { ok: false, reason: "looks_like_examples" };
  return { ok: true, text };
}
