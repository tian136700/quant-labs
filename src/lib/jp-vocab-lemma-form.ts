/**
 * 单词词条须存辞书形（原形），禁止礼貌体「〜ます」当 lemma。
 * 语法 kind=grammar（如「～ます」）不走本校验。
 */

/** 允许以「ます」结尾、但不是动词ます型的词条（副词等）。 */
const MASU_LEMMA_ALLOWLIST = new Set(["ますます"]);

export const JP_VOCAB_WORD_MASU_FORM_ERROR = "word_masu_form" as const;

/**
 * 单词 lemma 是否看起来像ます型（食べます / 違います / お願いします）。
 * 不含语法占位；调用方须先确认 kind === "word"。
 */
export function isJpVocabWordMasuFormLemma(word: string): boolean {
  const w = String(word || "").trim();
  if (!w || MASU_LEMMA_ALLOWLIST.has(w)) return false;
  // 去掉常见词尾标点后再判
  const bare = w.replace(/[。．.！!？?]+$/u, "");
  if (MASU_LEMMA_ALLOWLIST.has(bare)) return false;
  return /ます$/u.test(bare);
}
