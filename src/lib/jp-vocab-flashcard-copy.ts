/** 卡片「复制」：假名 + 汉字（相同时只复制一次） */
export function jpVocabFlashcardCopyText(
  readingTrim: string,
  wordTrim: string
): string {
  const reading = readingTrim.trim();
  const word = wordTrim.trim();
  if (reading && word && reading !== word) return `${reading} ${word}`;
  return word || reading;
}
