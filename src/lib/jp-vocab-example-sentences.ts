/** 课堂带读例句列：每行最多字符数（含标点） */
export const JP_VOCAB_EXAMPLE_SENTENCE_LINE_CHARS = 10;

/** 将存储的例句文本拆成多条（按换行；去掉行首已有序号） */
export function parseJpVocabExampleSentences(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.、．)\]]\s*/, "").trim())
    .filter(Boolean);
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

/** 格式化为带序号的展示块，供课堂带读表格渲染 */
export function formatJpVocabExampleSentencesForDisplay(
  raw: string | null | undefined,
  maxChars = JP_VOCAB_EXAMPLE_SENTENCE_LINE_CHARS
): JpVocabExampleSentenceDisplayBlock[] {
  return parseJpVocabExampleSentences(raw).map((sentence, index) => ({
    index: index + 1,
    lines: wrapJpVocabExampleLine(sentence, maxChars),
  }));
}
