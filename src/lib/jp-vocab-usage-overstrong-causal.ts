/**
 * 列举/并列类语法（～し、～たり 等）易被写成过强因果：
 * 「由多方面因素共同导致结论」——实际只是列举理由/情况，后文可接感想或结论，
 * 语法本身不等于「共同导致」。
 */

/** 用法正文过强因果套话（apply / 编辑拒） */
export const JP_VOCAB_USAGE_OVERSTRONG_CAUSAL_RE =
  /多方面因素.{0,16}(共同)?导致|多方面原因.{0,12}导致|由.{0,20}因素.{0,12}(共同)?导致|共同导致/;

export function jpVocabUsageHasOverstrongCausalClaim(text: string): boolean {
  return JP_VOCAB_USAGE_OVERSTRONG_CAUSAL_RE.test(String(text || ""));
}
