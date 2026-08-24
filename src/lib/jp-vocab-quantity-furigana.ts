/**
 * 数量词假名：N5～N4 常见训读特殊读（〜つ／人／日／歳／几点）。
 * AI 常误用音读（六(ろく)つ、九(きゅう)時、二十(にじゅう)歳）→ apply 拒 wrong_jukugo_furigana。
 */

function toHiragana(text: string): string {
  return String(text || "")
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[^ぁ-んー]/g, "");
}

/** 「〜つ」个数：一(ひと)つ … 六(むっ)つ */
export const JP_VOCAB_TUTSU_COUNTER_STEM: Record<string, string> = {
  一: "ひと",
  二: "ふた",
  三: "みっ",
  四: "よっ",
  五: "いつ",
  六: "むっ",
  七: "なな",
  八: "やっ",
  九: "ここの",
};

export const JP_VOCAB_TUTSU_COUNTER_FULL: Record<string, string> = {
  一つ: "ひとつ",
  二つ: "ふたつ",
  三つ: "みっつ",
  四つ: "よっつ",
  五つ: "いつつ",
  六つ: "むっつ",
  七つ: "ななつ",
  八つ: "やっつ",
  九つ: "ここのつ",
};

/** 人数：一人／二人 训读（三人起多为音读，不在此拦） */
export const JP_VOCAB_NIN_COUNTER_STEM: Record<string, string> = {
  一: "ひと",
  二: "ふた",
};

export const JP_VOCAB_NIN_COUNTER_FULL: Record<string, string> = {
  一人: "ひとり",
  二人: "ふたり",
};

/**
 * 日期「〜日」训读（二日＝ふつか…）。
 * 「一日」可 ついたち（几号）／いちにち（一天），不硬拦。
 */
export const JP_VOCAB_KA_DAY_STEM: Record<string, string> = {
  二: "ふつ",
  三: "みっ",
  四: "よっ",
  五: "いつ",
  六: "むい",
  七: "なの",
  八: "よう",
  九: "ここの",
  十: "とお",
};

export const JP_VOCAB_KA_DAY_FULL: Record<string, string> = {
  二日: "ふつか",
  三日: "みっか",
  四日: "よっか",
  五日: "いつか",
  六日: "むいか",
  七日: "なのか",
  八日: "ようか",
  九日: "ここのか",
  十日: "とおか",
  十四日: "じゅうよっか",
  二十日: "はつか",
  二十四日: "にじゅうよっか",
};

/** 几点：四時＝よじ、九時＝くじ；七時允许 しち／なな */
export const JP_VOCAB_JI_CLOCK_STEM: Record<string, readonly string[]> = {
  四: ["よ"],
  七: ["しち", "なな"],
  九: ["く"],
};

export const JP_VOCAB_JI_CLOCK_FULL: Record<string, readonly string[]> = {
  四時: ["よじ"],
  七時: ["しちじ", "ななじ"],
  九時: ["くじ"],
};

/** 年龄：二十歳＝はたち（禁止 にじゅうさい） */
export const JP_VOCAB_AGE_FULL: Record<string, string> = {
  二十歳: "はたち",
  二十才: "はたち",
};

const TUTSU_STEM_RE =
  /([一二三四五六七八九])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]つ/g;
const TUTSU_FULL_RE =
  /(一つ|二つ|三つ|四つ|五つ|六つ|七つ|八つ|九つ)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]/g;

const NIN_STEM_RE = /([一二])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]人/g;
const NIN_FULL_RE = /(一人|二人)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]/g;

const KA_STEM_RE =
  /([二三四五六七八九十])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]日/g;
const KA_FULL_RE =
  /(二日|三日|四日|五日|六日|七日|八日|九日|十日|十四日|二十日|二十四日)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]/g;

const JI_STEM_RE = /([四七九])[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]時/g;
const JI_FULL_RE = /(四時|七時|九時)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]/g;

const AGE_FULL_RE = /(二十歳|二十才)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]/g;
/** 二十(にじゅう)歳(さい) */
const AGE_COMPOUND_SPLIT_RE =
  /二十[（(]([ぁ-んァ-ンヴヵヶー]+)[）)][歳才][（(]([ぁ-んァ-ンヴヵヶー]+)[）)]/g;
/** 二(に)十(じゅう)歳(さい) 拆到单字 */
const AGE_TRIPLE_SPLIT_RE =
  /二[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]十[（(]([ぁ-んァ-ンヴヵヶー]+)[）)][歳才][（(]([ぁ-んァ-ンヴヵヶー]+)[）)]/g;

function readingNotIn(
  reading: string,
  allowed: string | readonly string[]
): boolean {
  if (typeof allowed === "string") return reading !== allowed;
  return !allowed.includes(reading);
}

/**
 * 例句是否把数量词标成错误音读。
 * 例：六(ろく)つ、一(いち)人、二(に)日、九(きゅう)時、二十(にじゅう)歳
 */
export function jpVocabExampleHasWrongQuantityFurigana(text: string): boolean {
  const s = String(text || "");
  if (!s) return false;

  for (const m of s.matchAll(TUTSU_STEM_RE)) {
    const exp = JP_VOCAB_TUTSU_COUNTER_STEM[m[1]!];
    if (exp && toHiragana(m[2]!) !== exp) return true;
  }
  for (const m of s.matchAll(TUTSU_FULL_RE)) {
    const exp = JP_VOCAB_TUTSU_COUNTER_FULL[m[1]!];
    if (exp && toHiragana(m[2]!) !== exp) return true;
  }

  for (const m of s.matchAll(NIN_STEM_RE)) {
    const exp = JP_VOCAB_NIN_COUNTER_STEM[m[1]!];
    if (exp && toHiragana(m[2]!) !== exp) return true;
  }
  for (const m of s.matchAll(NIN_FULL_RE)) {
    const exp = JP_VOCAB_NIN_COUNTER_FULL[m[1]!];
    if (exp && toHiragana(m[2]!) !== exp) return true;
  }

  for (const m of s.matchAll(KA_STEM_RE)) {
    const exp = JP_VOCAB_KA_DAY_STEM[m[1]!];
    if (exp && toHiragana(m[2]!) !== exp) return true;
  }
  for (const m of s.matchAll(KA_FULL_RE)) {
    const exp = JP_VOCAB_KA_DAY_FULL[m[1]!];
    if (exp && toHiragana(m[2]!) !== exp) return true;
  }

  for (const m of s.matchAll(JI_STEM_RE)) {
    const exp = JP_VOCAB_JI_CLOCK_STEM[m[1]!];
    if (exp && readingNotIn(toHiragana(m[2]!), exp)) return true;
  }
  for (const m of s.matchAll(JI_FULL_RE)) {
    const exp = JP_VOCAB_JI_CLOCK_FULL[m[1]!];
    if (exp && readingNotIn(toHiragana(m[2]!), exp)) return true;
  }

  for (const m of s.matchAll(AGE_FULL_RE)) {
    const exp = JP_VOCAB_AGE_FULL[m[1]!];
    if (exp && toHiragana(m[2]!) !== exp) return true;
  }
  for (const m of s.matchAll(AGE_COMPOUND_SPLIT_RE)) {
    const joined = toHiragana(m[1]!) + toHiragana(m[2]!);
    if (joined !== "はたち") return true;
  }
  for (const m of s.matchAll(AGE_TRIPLE_SPLIT_RE)) {
    const joined = toHiragana(m[1]!) + toHiragana(m[2]!) + toHiragana(m[3]!);
    if (joined !== "はたち") return true;
  }

  return false;
}

/** @deprecated 用 jpVocabExampleHasWrongQuantityFurigana */
export function jpVocabExampleHasWrongTutsuCounterFurigana(
  text: string
): boolean {
  return jpVocabExampleHasWrongQuantityFurigana(text);
}

/** prompt / 规则短提示（数量词训读） */
export const JP_VOCAB_QUANTITY_FURIGANA_PROMPT_HINT = `数量词训读特殊（禁止想当然用音读）：
   - 「〜つ」：✅「一(ひと)つ」「三(みっ)つ」「六(むっ)つ」／「六つ(むっつ)」；❌「六(ろく)つ」「三(さん)つ」（ろく＝六点的六，不是六个）
   - 「〜人」：✅「一(ひと)人」「二(ふた)人」／「一人(ひとり)」「二人(ふたり)」；❌「一(いち)人」「二人(ににん)」
   - 「〜日」日期：✅「二(ふつ)日」「三(みっ)日」「二十日(はつか)」；❌「二(に)日」「三日(さんにち)」（「一日」可ついたち／いちにち，按语境）
   - 「〜時」几点：✅「四(よ)時」「七(しち)時／七(なな)時」「九(く)時」；❌「四(よん)時」「九(きゅう)時」
   - 「二十歳」：✅「二十歳(はたち)」；❌「二十(にじゅう)歳(さい)」`;
