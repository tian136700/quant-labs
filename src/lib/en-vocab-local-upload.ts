import type { EnVocabUploadInput } from "@/lib/types";

/** fill-meaning 线上来源；保留，不当作 STT 误传释义清掉 */
export function isEnVocabTrustedOnlineMeaningSource(
  source: string | null | undefined
): boolean {
  return (source || "").trim().startsWith("线上");
}

/** local-upload / upload API：只推词与分类，不接受客户端释义（由后续 fill-meaning 补全）。 */
export function sanitizeEnVocabLocalUploadInput(
  input: EnVocabUploadInput
): EnVocabUploadInput {
  const { meaning: _meaning, ...rest } = input;
  return rest;
}

export function sanitizeEnVocabLocalUploadInputs(
  words: EnVocabUploadInput[]
): EnVocabUploadInput[] {
  return words.map(sanitizeEnVocabLocalUploadInput);
}
