/**
 * 日语词条「接序」：接续形态说明（动词辞书形／一类・二类形容词／名词等如何接该语法或本词活用）。
 * 与用法/例句同一次模型输出；用法正文禁止再写接序。
 */

export const JP_VOCAB_CONNECTION_SECTION_MARKER = "【接序】";

export const JP_VOCAB_CONNECTION_UPLOAD_SPEC = {
  version: 3,
  label: "接序",
  format_example_grammar:
    "用法1: 动词原形＋「ことがある」\n用法2: 动词た形＋「ことがある」\n否定形: ことがない／ことはない",
  format_example_word:
    "一类动词（五段）／原形：「書く」；ます形：「書きます」；て形：「書いて」",
  rules: [
    "接序单独成段，放在用法/例句之后，以「【接序】」起头",
    "用法说明里禁止再写接序（接续形态）；接序只写在本字段",
    "用中文说明；日语形态用「」短引，禁止 漢字(かな) 假名括注",
    "否定形／疑问形／肯定形等变体必须另起一行（如「否定形: …」「疑问形: …」），禁止和主接续挤同一行",
    "对学生友好：写清词类，如「动词原形／一类形容词原形／二类形容词原形／名词＋本语法」；❌ 禁止只写笼统的「原形＋…」",
    "な形容词／名词有特殊接法时，用短句说清（如「不加だ」「加だ」「＋な」「＋の」）",
    "若仍写「动词辞书形」必须写成「动词辞书形（动词原形）」；不要只写「动词辞书形」",
    "语法若有多条编号用法：接序必须按「用法1:」「用法2:」分行写（与上面 1. 2. 用法一一对应）；同一行禁止串写多个「用法N」",
    "各用法接续相同时，可只写共用形态（不必硬凑用法1/2）；有差异则必须分行对应",
    "否定形/注意等共用说明另起一行（如「否定形: …」）",
    "单词：写词类与常用活用（原形/ます形/て形或一类·二类形容词等）",
    "2～6 行即可；不要 markdown、不要行首 1. 2.（用「用法N:」标签）",
  ],
  reject_reasons: ["empty", "too_short", "looks_like_examples"],
} as const;

const FENCE_RE = /^```(?:\w+)?\s*$/;
const FURIGANA_PAREN_RE = /\([\u3040-\u309Fー]+\)/;
const GLOSS_LINE_RE = /^(译文|譯文)\s*[：:]/;
/** 已带「（动词原形）」或半角括号的，归一成全角注解（中/日） */
const DONGCI_JISHOKEI_RE =
  /(?:动词辞书形|動詞辞書形)(?:（动词原形）|\(动词原形\))?/g;

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
  const expanded = expandJpVocabConnectionUsageInlineBreaks(String(raw ?? ""));
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
- ✅ 对学生友好：写清词类：动词原形／一类形容词原形／二类形容词原形／名词＋本语法；❌禁止只写笼统「原形＋…」；少用「普通形」「现在肯定为词干」；な形容词／名词特殊时用短句（如「不加だ」「加だ」）。
- ✅ 若仍写「动词辞书形」，必须写成「动词辞书形（动词原形）」；日语形态用「」短引，不要假名括注。
- 2～6 行；不要 markdown、不要给接序再编行首 1. 2.。

示例接序段（多用法、接续不同）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
用法1: 动词原形＋「ことがある」
用法2: 动词た形＋「ことがある」
否定形: ことがない／ことはない

示例接序段（各用法接续相同）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
动词原形＋「～前に」
名词＋の＋「前に」`;
  }
  return `
接序（必须同一次输出，单独成段）：
- 在全部例句写完后，另起一行写「${JP_VOCAB_CONNECTION_SECTION_MARKER}」，下面写本词接序/活用要点。
- ❌ 不要把接序混进例句或译文。
- ✅ 写词类（一类动词／二类动词／一类形容词／二类形容词／名词等）及常用形（辞书形、ます形、て形等，按本词需要）；日语用「」短引，不要假名括注。
- ✅ 若写「动词辞书形」须写成「动词辞书形（动词原形）」。
- 2～4 行即可。

示例接序段：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
一类动词（五段）／辞书形（动词原形）：「書く」；ます形：「書きます」；て形：「書いて」`;
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
- ✅ 对学生友好：写清词类：动词原形／一类形容词原形／二类形容词原形／名词＋本语法；❌禁止只写笼统「原形＋…」；少用「普通形」「现在肯定为词干」；な／名词特殊时短句说清（不加だ／加だ）。
- 若仍写「动词辞书形」必须写成「动词辞书形（动词原形）」；日语形态用「」短引；不要假名括注。
- 不要写用法长文、不要写例句、不要 markdown。

输出示例（接续不同）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
用法1: 动词原形＋「ことがある」
用法2: 动词た形＋「ことがある」
否定形: ことがない／ことはない

输出示例（接续相同）：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
动词原形＋「～前に」
名词＋の＋「前に」`;
  }

  return `${meta}

请只写该日语单词的「接序」（词类与常用活用），供中文母语 N5～N4 学习者看卡片。

硬规则：
- 第一行必须是「${JP_VOCAB_CONNECTION_SECTION_MARKER}」，下面 2～4 行。
- 写词类与辞书形/ます形/て形等（按本词需要）；日语用「」短引；不要假名括注。
- 若写「动词辞书形」须写成「动词辞书形（动词原形）」。
- 不要写例句、不要 markdown。

输出示例：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
一类动词（五段）／辞书形（动词原形）：「書く」；ます形：「書きます」；て形：「書いて」`;
}

export function validateJpVocabConnectionAiOutput(
  raw: string,
  _input?: JpVocabConnectionAiInput
): { ok: true; text: string } | { ok: false; reason: string } {
  let text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
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
