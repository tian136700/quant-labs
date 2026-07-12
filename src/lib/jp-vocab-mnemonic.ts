import type { JpVocabWord } from "@/lib/types";

/** 非管理员客户端不返回巧记正文 */
export function redactJpVocabMnemonicForClient(
  word: JpVocabWord,
  isAdmin: boolean
): JpVocabWord {
  if (isAdmin || word.mnemonic == null) return word;
  return { ...word, mnemonic: null };
}

export function redactJpVocabWordsMnemonicForClient(
  words: JpVocabWord[],
  isAdmin: boolean
): JpVocabWord[] {
  if (isAdmin) return words;
  return words.map((w) => redactJpVocabMnemonicForClient(w, false));
}
