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

/** as ------- as possible / 下划线挖空句型 */
const DASH_BLANK_SLOT_RE = /(?:-{3,}|_{3,}|—{2,}|－{2,})/;

/** unaware that + 从句 / adj. + that / V + N 等「加号挖空」句型 */
const PLUS_SLOT_RE =
  /(?:\s\+\s|\+\s*[\u4e00-\u9fff]|\b(?:that|which|who|whom|where|when|if|whether|to)\s*\+|\+\s*(?:clause|n\.?|v\.?|adj\.?|adv\.?|sth\.?|sb\.?)\b)/i;

/** 词条里带中文语法课名：从句 / 句型 / 时态 … */
const ZH_GRAMMAR_LABEL_RE =
  /(?:从句|句型|句式|搭配|语法|时态|语态|结构|用法说明)/;

/**
 * 完整疑问句作词条（签证/口语课常整句入库，如 Are you going for tourism?）。
 * ≥3 词 + 疑问助词/wh 开头 + 以 ? 结尾 → 语法（勿当 word 强要 IPA）。
 */
const INTERROGATIVE_SENTENCE_RE =
  /^(?:Are|Is|Am|Was|Were|Do|Does|Did|Will|Would|Can|Could|Shall|Should|Have|Has|Had|May|Might|How|What|Why|When|Where|Who|Whom|Which|Whose)\b.+\?\s*$/i;

/**
 * 完整陈述句作词条（口语/签证课常整句入库，如 I'm going sightseeing.）。
 * ≥3 词 + 人称缩写/主语+助动词开头 + 以 .! 结尾 → 语法（勿当 word 强要 IPA）。
 * 不匹配无句末标点的短语动词（look forward to）或无主语助动词的固定短语。
 */
const DECLARATIVE_SENTENCE_RE =
  /^(?:I'm|I've|I'll|I'd|We're|We've|We'll|We'd|They're|They've|They'll|They'd|You're|You've|You'll|You'd|He's|She's|It's|(?:I|We|They|You|He|She|It)\s+(?:am|is|are|was|were|have|has|had|will|would|can|could|shall|should|do|does|did|may|might))\b.+(?:\.|!)\s*$/i;

export type EnVocabKindSuggest = "word" | "grammar";

/** ≥3 词的完整疑问/陈述句（口语整句；存库仍用 kind=grammar，禁止 IPA）。 */
export function enVocabLemmaLooksLikeFullSentence(raw: string): boolean {
  const word = String(raw || "").trim();
  if (!word) return false;
  if ((word.match(/ /g) || []).length < 2) return false;
  return INTERROGATIVE_SENTENCE_RE.test(word) || DECLARATIVE_SENTENCE_RE.test(word);
}

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
  if (DASH_BLANK_SLOT_RE.test(word)) return true;
  if (PLUS_SLOT_RE.test(word)) return true;
  if (ZH_GRAMMAR_LABEL_RE.test(word)) return true;
  if (SLOT_WORD_RE.test(word)) return true;
  if (LETTER_SLOT_RE.test(word) && /\s/.test(word)) return true;
  // 空格数 ≥2 → 至少 3 词；Really? 等单词语气词不改 grammar
  if (enVocabLemmaLooksLikeFullSentence(word)) {
    return true;
  }

  return false;
}

export function suggestEnVocabKindFromLemma(raw: string): EnVocabKindSuggest {
  return enVocabLemmaLooksLikeGrammar(raw) ? "grammar" : "word";
}
