/**
 * 日语词条「接序」：接续形态说明（动词辞书形／一类・二类形容词／名词等如何接该语法或本词活用）。
 * 与用法/例句同一次模型输出；用法正文禁止再写接序。
 */

export const JP_VOCAB_CONNECTION_SECTION_MARKER = "【接序】";

export const JP_VOCAB_CONNECTION_UPLOAD_SPEC = {
  version: 1,
  label: "接序",
  format_example_grammar:
    "动词辞书形（动词原形）＋「～前に」\n名词＋の＋「前に」",
  format_example_word:
    "一类动词（五段）／辞书形（动词原形）：「書く」；ます形：「書きます」；て形：「書いて」",
  rules: [
    "接序单独成段，放在用法/例句之后，以「【接序】」起头",
    "用法说明里禁止再写接序（接续形态）；接序只写在本字段",
    "用中文说明；日语形态用「」短引，禁止 漢字(かな) 假名括注",
    "凡写「动词辞书形」必须写成「动词辞书形（动词原形）」；不要只写「动词辞书形」",
    "语法：写清各类词怎么接本语法（动词哪一形、一类/二类形容词、名词等）",
    "单词：写词类与常用活用（辞书形/ます形/て形或一类·二类形容词等）",
    "2～6 行即可；不要 markdown、不要行首编号（可用顿号或换行）",
  ],
  reject_reasons: ["empty", "too_short", "looks_like_examples"],
} as const;

const FENCE_RE = /^```(?:\w+)?\s*$/;
const FURIGANA_PAREN_RE = /\([\u3040-\u309Fー]+\)/;
const GLOSS_LINE_RE = /^(译文|譯文)\s*[：:]/;
/** 已带「（动词原形）」或半角括号的，归一成全角注解 */
const DONGCI_JISHOKEI_RE =
  /动词辞书形(?:（动词原形）|\(动词原形\))?/g;

/**
 * 「动词辞书形」一律写成「动词辞书形（动词原形）」；已有注解则归一、不叠写。
 * 展示 / 写回 / prompt 规范化共用。
 */
export function formatJpVocabDongciJishokeiLabel(raw: string): string {
  return String(raw ?? "").replace(DONGCI_JISHOKEI_RE, "动词辞书形（动词原形）");
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
  const lines = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== JP_VOCAB_CONNECTION_SECTION_MARKER)
    .filter((line) => !FENCE_RE.test(line))
    .map((line) => formatJpVocabDongciJishokeiLabel(line));
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
接序（必须同一次输出，单独成段）：
- 在全部用法与例句写完后，另起一行写「${JP_VOCAB_CONNECTION_SECTION_MARKER}」，下面写接续形态。
- ❌ 禁止把接序写进「用法」行（用法只讲含义/功能，不写「动词て形＋…」这类接续清单）。
- ✅ 接序写清：动词用哪一形、一类形容词（い形容词）、二类形容词（な形容词）、名词等如何接本语法；日语形态用「」短引，不要假名括注。
- ✅ 凡出现「动词辞书形」必须写成「动词辞书形（动词原形）」，不要省略括号说明。
- 2～6 行；不要 markdown、不要给接序再编 1. 2.。

示例接序段：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
动词辞书形（动词原形）＋「～前に」
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

硬规则：
- 第一行必须是「${JP_VOCAB_CONNECTION_SECTION_MARKER}」，下面 2～6 行接续说明。
- 写清动词哪一形、一类/二类形容词、名词等如何接本语法；日语形态用「」短引；不要假名括注。
- 凡出现「动词辞书形」必须写成「动词辞书形（动词原形）」。
- 不要写用法长文、不要写例句、不要 markdown。

输出示例：
${JP_VOCAB_CONNECTION_SECTION_MARKER}
动词辞书形（动词原形）＋「～前に」
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
