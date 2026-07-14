/** 课堂带读例句列：每行最多字符数（含标点） */
export const JP_VOCAB_EXAMPLE_SENTENCE_LINE_CHARS = 10;

const LEADING_INDEX_RE = /^\s*\d+[.、．)\]]\s*/;

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

/** 含平假名/片假名 → 视为日语例句行 */
export function isJpVocabExampleJapaneseLine(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

/**
 * 无假名、但含汉字或拉丁文 → 视为上一条例句的译义行（不占序号）。
 * 例如：「日本語を習います。」下一行「我学习日语。」
 */
export function isJpVocabExampleGlossLine(text: string): boolean {
  if (!text.trim()) return false;
  if (isJpVocabExampleJapaneseLine(text)) return false;
  if (/[\u4E00-\u9FFF]/.test(text)) return true;
  if (/[A-Za-z\u00C0-\u024F]{2,}/.test(text)) return true;
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
 * @deprecated Prefer parseJpVocabExampleSentenceItems；保留兼容，返回「每条」的主行+译义拼成的多行文本时请用 items。
 * 仍按换行拆成原始行（含译义行），用于不需要编号的场景。
 */
export function parseJpVocabExampleSentences(raw: string | null | undefined): string[] {
  return splitJpVocabExampleSentenceLines(raw);
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

export type JpVocabExampleSentenceDisplayBlock = {
  index: number;
  lines: string[];
};

/** 格式化为带序号的展示块：序号只给日语例句，译义行跟在同块内不占新序号 */
export function formatJpVocabExampleSentencesForDisplay(
  raw: string | null | undefined,
  maxChars = JP_VOCAB_EXAMPLE_SENTENCE_LINE_CHARS
): JpVocabExampleSentenceDisplayBlock[] {
  return parseJpVocabExampleSentenceItems(raw).map((item, index) => {
    const lines = [
      ...wrapJpVocabExampleLine(item.text, maxChars),
      ...item.glossLines.flatMap((gloss) =>
        wrapJpVocabExampleLine(gloss, maxChars)
      ),
    ];
    return { index: index + 1, lines };
  });
}
