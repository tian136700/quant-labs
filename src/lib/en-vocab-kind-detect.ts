/**
 * 英语词条：启发式判断「标成单词、实为语法/句型模板」。
 * 供 fill-kind / online-batch 自动改 kind=grammar。
 *
 * 保留为单词：普通单词、无占位的短语动词（look forward to）。
 * 改成语法：both A and B、cater to somebody、Present Perfect 等。
 */

const SLOT_WORD_RE =
  /\b(?:somebody|someone|something|somewhere|somehow|anyone|anybody|anything|anywhere|everybody|everyone|everything|everywhere|nobody|nothing|nowhere|sb\.?|sth\.?)\b/i;

/** 独立大写占位 A / B / C（非句首专名整词） */
const LETTER_SLOT_RE = /(?:^|[\s(/])[A-C](?:[\s)/]|$)/;

/** both A and B / either A or Or / neither … nor … */
const AB_PATTERN_RE =
  /\b(?:both\s+[A-C]\s+and\s+[A-C]|either\s+[A-C]\s+or\s+[A-C]|neither\s+[A-C]\s+nor\s+[A-C]|not\s+only\s+[A-C]\s+but\s+(?:also\s+)?[A-C])\b/i;

/** 时态 / 语态等语法课名（Title Case 多词） */
const TENSE_NAME_RE =
  /\b(?:present|past|future)\s+(?:simple|perfect|continuous|progressive|perfect\s+continuous)\b|\b(?:passive\s+voice|active\s+voice|conditional\s+(?:I{1,3}|1|2|3)|subjunctive\s+mood|reported\s+speech|relative\s+clause|attributive\s+clause)\b/i;

/** will be to / will be doing … 等将来安排句型 */
const WILL_BE_PATTERN_RE =
  /\bwill\s+be\s+(?:to\b|doing\b)/i;

const ELLIPSIS_SLOT_RE = /(?:…|\.{3}|～|~)/;

export type EnVocabKindSuggest = "word" | "grammar";

/**
 * 词条原文是否更像语法/句型模板（而非普通单词或短语动词）。
 */
export function enVocabLemmaLooksLikeGrammar(raw: string): boolean {
  const word = String(raw || "").trim();
  if (!word) return false;

  if (AB_PATTERN_RE.test(word)) return true;
  if (TENSE_NAME_RE.test(word)) return true;
  if (WILL_BE_PATTERN_RE.test(word)) return true;
  if (ELLIPSIS_SLOT_RE.test(word)) return true;
  if (SLOT_WORD_RE.test(word)) return true;
  if (LETTER_SLOT_RE.test(word) && /\s/.test(word)) return true;

  return false;
}

export function suggestEnVocabKindFromLemma(raw: string): EnVocabKindSuggest {
  return enVocabLemmaLooksLikeGrammar(raw) ? "grammar" : "word";
}
