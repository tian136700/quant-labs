import type { EnVocabUploadInput } from "@/lib/types";

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
