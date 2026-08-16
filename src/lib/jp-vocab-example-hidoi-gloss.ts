/**
 * 「酷い／ひどい」≠「可怕」：可怕≈怖い；ひどい＝过分／糟糕／残酷。
 */

export function jpVocabExampleHasHidoiKowaiGlossMismatch(
  glossBody: string,
  word: string
): boolean {
  const lemma = String(word || "")
    .replace(/[～~〜]/g, "")
    .trim();
  if (lemma !== "酷い" && lemma !== "ひどい") return false;
  return /可怕/.test(String(glossBody || ""));
}
