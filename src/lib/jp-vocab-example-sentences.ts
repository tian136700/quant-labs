/** 课堂带读例句列：每行最多字符数（含标点） */
export const JP_VOCAB_EXAMPLE_SENTENCE_LINE_CHARS = 10;

const LEADING_INDEX_RE = /^\s*\d+[.、．)\]]\s*/;
const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF]/g;
const HAN_RE = /[\u4E00-\u9FFF]/g;
const LATIN_RE = /[A-Za-z\u00C0-\u024F]/g;

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

/** 含平假名/片假名，且假名足够多 → 视为日语例句行 */
export function isJpVocabExampleJapaneseLine(text: string): boolean {
  const kana = countMatches(text, KANA_RE);
  if (kana === 0) return false;
  const han = countMatches(text, HAN_RE);
  // 偶有假名夹在纯中文里：汉字远多于假名 → 不当日语例句
  if (han >= 2 && kana > 0 && han >= kana * 3) return false;
  return true;
}

/**
 * 上一条例句的译义行（不占序号）：
 * - 无假名但有汉字/拉丁文
 * - 或汉字远多于假名（中文译义里偶尔夹了假名）
 */
export function isJpVocabExampleGlossLine(text: string): boolean {
  if (!text.trim()) return false;
  if (isJpVocabExampleJapaneseLine(text)) return false;
  const kana = countMatches(text, KANA_RE);
  const han = countMatches(text, HAN_RE);
  const latin = countMatches(text, LATIN_RE);
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
    const lines: JpVocabExampleSentenceDisplayLine[] = [
      ...wrapJpVocabExampleLine(item.text, maxChars).map((text) => ({
        text,
        kind: "primary" as const,
      })),
      ...item.glossLines.flatMap((gloss) =>
        wrapJpVocabExampleLine(gloss, maxChars).map((text) => ({
          text,
          kind: "gloss" as const,
        }))
      ),
    ];
    return { index: index + 1, lines };
  });
}
