/** 课堂带读例句列：每行最多字符数（含标点） */
export const JP_VOCAB_EXAMPLE_SENTENCE_LINE_CHARS = 10;

/** 译义行统一前缀（存库与展示） */
export const JP_VOCAB_EXAMPLE_GLOSS_LABEL = "译文：";

const LEADING_INDEX_RE = /^\s*\d+[.、．)\]]\s*/;
const GLOSS_LABEL_RE = /^(译文|翻譯|翻译|译|譯)\s*[:：]\s*/;
const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF]/g;
const HAN_RE = /[\u4E00-\u9FFF]/g;
const LATIN_RE = /[A-Za-z\u00C0-\u024F]/g;

/**
 * 存库假名标注：汉字后半角括号，如 電車(でんしゃ)。
 * 展示层转成「汉字正下方小字」，勿把括号原文直接塞进 UI。
 */
export const JP_VOCAB_PAREN_FURIGANA_RE =
  /([\u4E00-\u9FFF々]+)\(([ぁ-んァ-ンヴヵヶー]+)\)/g;

export type JpVocabFuriganaSegment =
  | { type: "text"; value: string }
  | { type: "ruby"; base: string; reading: string };

/** 把「漢字(かな)」拆成展示分段；无标注则整段纯文本 */
export function parseJpVocabParenFurigana(
  text: string | null | undefined
): JpVocabFuriganaSegment[] {
  const raw = text ?? "";
  if (!raw) return [];
  const re = new RegExp(
    JP_VOCAB_PAREN_FURIGANA_RE.source,
    JP_VOCAB_PAREN_FURIGANA_RE.flags
  );
  const out: JpVocabFuriganaSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    if (match.index > last) {
      out.push({ type: "text", value: raw.slice(last, match.index) });
    }
    out.push({ type: "ruby", base: match[1], reading: match[2] });
    last = match.index + match[0].length;
  }
  if (last < raw.length) {
    out.push({ type: "text", value: raw.slice(last) });
  }
  return out.length ? out : [{ type: "text", value: raw }];
}

/** 去掉括号假名，只留汉字/假名正文（比较、无障碍朗读用） */
export function stripJpVocabParenFurigana(text: string): string {
  return text.replace(
    new RegExp(
      JP_VOCAB_PAREN_FURIGANA_RE.source,
      JP_VOCAB_PAREN_FURIGANA_RE.flags
    ),
    "$1"
  );
}

/**
 * 合法假名括注：紧贴汉字，括号内仅假名（无空格/汉字/句号）。
 * 非法：整句尾注 `です。(たなかさん げんき です。)` —— 展示难看，校验应拒。
 */
const VALID_KANJI_FURIGANA_CHUNK =
  /[\u4E00-\u9FFF々]+\([ぁ-んァ-ンヴヵヶー]+\)/g;

/** 去掉非法整句尾注括号；保留合法 漢字(かな) */
export function sanitizeJpVocabExampleJapaneseLine(text: string): string {
  let s = String(text || "").trim();
  if (!s) return s;
  s = s.replace(/([。．.!！?？])\s*[（(][^）)]*[ぁ-んァ-ン][^）)]*[）)]\s*$/u, "$1");
  s = s.replace(/[（(][^）)]*\s[^）)]*[）)]/g, "");
  s = s.replace(/[（(][^）)]*[。．][^）)]*[）)]/g, "");
  return s.trim();
}

/** 去掉所有半角/全角括号块（语法点是否出现：勿把括注里的「が」算进去） */
export function stripAllJpVocabParenBlocks(text: string): string {
  return String(text || "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "");
}

/** 是否仍有非法括注（非整贴汉字假名） */
export function jpVocabExampleHasInvalidFuriganaParen(text: string): boolean {
  const withoutValid = String(text || "").replace(VALID_KANJI_FURIGANA_CHUNK, "");
  return /[（(][^）)]*[ぁ-んァ-ン][^）)]*[）)]/.test(withoutValid);
}

/** 拆行并去掉行首已有序号 */
export function splitJpVocabExampleSentenceLines(
  raw: string | null | undefined
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(LEADING_INDEX_RE, "").trim())
    .filter(Boolean);
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return (text.match(new RegExp(re.source, flags)) || []).length;
}

/** 去掉「译文：」等标签后看正文 */
export function stripJpVocabExampleGlossLabel(text: string): string {
  return text.replace(GLOSS_LABEL_RE, "").trim();
}

/** 统一成「译文：…」；空正文返回空串 */
export function formatJpVocabExampleGlossLine(text: string): string {
  const body = stripJpVocabExampleGlossLabel(text);
  return body ? `${JP_VOCAB_EXAMPLE_GLOSS_LABEL}${body}` : "";
}

/** 含平假名/片假名，且假名足够多 → 视为日语例句行 */
export function isJpVocabExampleJapaneseLine(text: string): boolean {
  const stripped = stripJpVocabExampleGlossLabel(text);
  // 「译文：…」即使偶有假名也不当日语例句
  if (GLOSS_LABEL_RE.test(text.trim())) return false;
  const kana = countMatches(stripped, KANA_RE);
  if (kana === 0) return false;
  const han = countMatches(stripped, HAN_RE);
  // 偶有假名夹在纯中文里：汉字远多于假名 → 不当日语例句
  if (han >= 2 && kana > 0 && han >= kana * 3) return false;
  return true;
}

/**
 * 上一条例句的译义行（不占序号）：
 * - 以「译文：」开头
 * - 无假名但有汉字/拉丁文
 * - 或汉字远多于假名（中文译义里偶尔夹了假名）
 */
export function isJpVocabExampleGlossLine(text: string): boolean {
  if (!text.trim()) return false;
  if (GLOSS_LABEL_RE.test(text.trim())) return true;
  if (isJpVocabExampleJapaneseLine(text)) return false;
  const body = stripJpVocabExampleGlossLabel(text);
  const kana = countMatches(body, KANA_RE);
  const han = countMatches(body, HAN_RE);
  const latin = countMatches(body, LATIN_RE);
  if (han > 0 && kana === 0) return true;
  if (latin >= 2 && kana === 0) return true;
  if (han >= 2 && kana > 0 && han >= kana * 3) return true;
  return false;
}

export type JpVocabExampleSentenceItem = {
  /** 日语例句正文 */
  text: string;
  /** 附在该例句下的译义行（中文/英文等，不单独编号） */
  glossLines: string[];
};

/** 按「日语例句 + 可选译义行」分组；仅日语例句占用 1、2、3… */
export function parseJpVocabExampleSentenceItems(
  raw: string | null | undefined
): JpVocabExampleSentenceItem[] {
  const lines = splitJpVocabExampleSentenceLines(raw);
  const items: JpVocabExampleSentenceItem[] = [];
  for (const line of lines) {
    if (items.length > 0 && isJpVocabExampleGlossLine(line)) {
      items[items.length - 1].glossLines.push(line);
      continue;
    }
    items.push({ text: line, glossLines: [] });
  }
  return items;
}

/** 写回存库格式：日语一行，下一行「译文：…」（序号由展示层加） */
export function serializeJpVocabExampleSentenceItems(
  items: readonly JpVocabExampleSentenceItem[]
): string {
  return items
    .map((item) => {
      const primary = item.text.trim();
      if (!primary) return "";
      const glosses = item.glossLines
        .map((g) => formatJpVocabExampleGlossLine(g))
        .filter(Boolean);
      return glosses.length ? `${primary}\n${glosses.join("\n")}` : primary;
    })
    .filter(Boolean)
    .join("\n");
}

/** 单条例句一键复制：日语（含括号假名）+ 全部译文行 */
export function jpVocabExampleSentenceItemCopyText(
  item: JpVocabExampleSentenceItem
): string {
  return serializeJpVocabExampleSentenceItems([item]).trim();
}

/** 全部例句一键复制：带序号，每条含日语（括号假名）+ 译文 */
export function jpVocabExampleSentencesCopyText(
  items: readonly JpVocabExampleSentenceItem[]
): string {
  return items
    .map((item, index) => {
      const body = jpVocabExampleSentenceItemCopyText(item);
      if (!body) return "";
      const [primary, ...rest] = body.split("\n");
      const head = `${index + 1}. ${primary}`;
      return rest.length ? `${head}\n${rest.join("\n")}` : head;
    })
    .filter(Boolean)
    .join("\n");
}

/** 人手填写 / 老师在编辑弹窗改正例句时的来源标记 */
export const JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL = "手动";

/** 内置 N5 词表补全 */
export const JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_CATALOG = "内置词表";

const EXAMPLE_SOURCE_MAX_LEN = 64;

/** 规范化例句来源；空 → null；过长截断 */
export function normalizeJpVocabExampleSentencesSource(
  raw: string | null | undefined
): string | null {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.length > EXAMPLE_SOURCE_MAX_LEN
    ? text.slice(0, EXAMPLE_SOURCE_MAX_LEN)
    : text;
}

/**
 * 规范化已有例句块：译义行补上「译文：」前缀；不翻译、不改日语。
 * 若无需改动则返回 null。
 */
export function normalizeJpVocabExampleSentencesFormat(
  raw: string | null | undefined
): string | null {
  const items = parseJpVocabExampleSentenceItems(raw);
  if (!items.length) return null;
  const normalized = serializeJpVocabExampleSentenceItems(items);
  const original = (raw || "").trim();
  return normalized === original ? null : normalized;
}

/** 是否存在缺中文译义的日语例句 */
export function jpVocabExampleSentencesNeedGlossFill(
  raw: string | null | undefined
): boolean {
  return parseJpVocabExampleSentenceItems(raw).some(
    (item) => item.glossLines.length === 0
  );
}

/**
 * @deprecated Prefer parseJpVocabExampleSentenceItems
 */
export function parseJpVocabExampleSentences(raw: string | null | undefined): string[] {
  return splitJpVocabExampleSentenceLines(raw);
}

/** 比较用：去掉空白/序号差异后再比是否「同一句」 */
export function normalizeJpVocabExamplePrimaryForCompare(text: string): string {
  return text
    .normalize("NFKC")
    .replace(LEADING_INDEX_RE, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * 找出重复的日语例句正文（不含译义行）。
 * 返回首次出现后的重复原文，供提示展示。
 */
export function findDuplicateJpVocabExamplePrimaries(
  raw: string | null | undefined
): string[] {
  const items = parseJpVocabExampleSentenceItems(raw);
  const seen = new Set<string>();
  const reported = new Set<string>();
  const duplicates: string[] = [];
  for (const item of items) {
    const key = normalizeJpVocabExamplePrimaryForCompare(item.text);
    if (!key) continue;
    if (seen.has(key)) {
      if (!reported.has(key)) {
        duplicates.push(item.text);
        reported.add(key);
      }
    } else {
      seen.add(key);
    }
  }
  return duplicates;
}

/** 把单条例句按固定字数折行 */
export function wrapJpVocabExampleLine(
  text: string,
  maxChars = JP_VOCAB_EXAMPLE_SENTENCE_LINE_CHARS
): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    current += char;
    if (current.length >= maxChars) {
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines;
}

export type JpVocabExampleSentenceDisplayLine = {
  text: string;
  kind: "primary" | "gloss";
};

export type JpVocabExampleSentenceDisplayBlock = {
  index: number;
  lines: JpVocabExampleSentenceDisplayLine[];
};

/** 格式化为带序号的展示块：序号只给日语例句，译义行跟在同块内不占新序号 */
export function formatJpVocabExampleSentencesForDisplay(
  raw: string | null | undefined,
  maxChars = JP_VOCAB_EXAMPLE_SENTENCE_LINE_CHARS
): JpVocabExampleSentenceDisplayBlock[] {
  return parseJpVocabExampleSentenceItems(raw).map((item, index) => {
    const glossTexts = item.glossLines.length
      ? item.glossLines.map((g) => formatJpVocabExampleGlossLine(g))
      : [];
    const lines: JpVocabExampleSentenceDisplayLine[] = [
      ...wrapJpVocabExampleLine(item.text, maxChars).map((text) => ({
        text,
        kind: "primary" as const,
      })),
      ...glossTexts.flatMap((gloss) =>
        wrapJpVocabExampleLine(gloss, maxChars).map((text) => ({
          text,
          kind: "gloss" as const,
        }))
      ),
    ];
    return { index: index + 1, lines };
  });
}
