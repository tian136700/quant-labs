/** 英语例句解析 / 规范化（英文行 + 译文：中文） */

export const EN_VOCAB_EXAMPLE_GLOSS_LABEL = "译文：";

const LEADING_INDEX_RE = /^\s*\d+[.、．)\]]\s*/;
const GLOSS_LABEL_RE = /^(译文|翻譯|翻译|译|譯)\s*[:：]\s*/;
const HAN_RE = /[\u4E00-\u9FFF]/;
const LATIN_RE = /[A-Za-z]/;

export type EnVocabExampleSentenceItem = {
  text: string;
  gloss: string;
};

export function splitEnVocabExampleSentenceLines(
  raw: string | null | undefined
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(LEADING_INDEX_RE, "").trim())
    .filter(Boolean);
}

/** 去掉标签与行首 `/`／；叠「译文：」也一并剥掉 */
export function stripEnVocabExampleGlossLabel(text: string): string {
  let body = String(text ?? "").trim();
  for (let i = 0; i < 8; i++) {
    const next = body
      .replace(GLOSS_LABEL_RE, "")
      .replace(/^[\s／/]+/, "")
      .trim();
    if (next === body) break;
    body = next;
  }
  return body;
}

export function formatEnVocabExampleGlossLine(text: string): string {
  const body = stripEnVocabExampleGlossLabel(text);
  return body ? `${EN_VOCAB_EXAMPLE_GLOSS_LABEL}${body}` : "";
}

export function isEnVocabExampleEnglishLine(text: string): boolean {
  const stripped = stripEnVocabExampleGlossLabel(text);
  if (GLOSS_LABEL_RE.test(text.trim())) return false;
  if (!LATIN_RE.test(stripped)) return false;
  // 纯中文行不当英语例句
  const han = (stripped.match(new RegExp(HAN_RE.source, "g")) || []).length;
  const latin = (stripped.match(new RegExp(LATIN_RE.source, "g")) || []).length;
  if (han >= 4 && latin > 0 && han >= latin) return false;
  return true;
}

/** 英文行里的单词 token（含 don't 这类缩写） */
export function enVocabEnglishWordTokens(text: string): string[] {
  return String(text ?? "").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
}

const EN_SENTENCE_FINAL_PUNCT_RE = /[.!?]["']?\s*$/;

/** 常见助动词 / be / 情态，用来区分「完整小句」与「搭配短语」 */
const EN_FINITE_HINT_RE =
  /\b(?:am|is|are|was|were|be|been|being|do|does|did|have|has|had|will|would|can|could|may|might|must|should|shall|need|needs|ought)\b/i;

/**
 * 例句必须是完整英文句，禁止只写词条本身或搭配短语却配整句中文。
 * 仅作「像不像句子」门禁；词条是否出现由 validate 另行检查。
 */
export function assessEnVocabExampleEnglishSentence(
  english: string,
  word: string,
  gloss?: string | null
): { ok: true } | { ok: false; reason: string } {
  const en = String(english ?? "").trim();
  if (!en) return { ok: false, reason: "english_not_sentence" };

  const tokens = enVocabEnglishWordTokens(en);
  const lemmaTokens = enVocabEnglishWordTokens(word);
  if (
    lemmaTokens.length > 0 &&
    tokens.length === lemmaTokens.length &&
    tokens.every(
      (t, i) => t.toLowerCase() === (lemmaTokens[i] || "").toLowerCase()
    )
  ) {
    return { ok: false, reason: "lemma_only_example" };
  }

  if (tokens.length < 3) {
    return { ok: false, reason: "english_not_sentence" };
  }

  if (!EN_SENTENCE_FINAL_PUNCT_RE.test(en)) {
    return { ok: false, reason: "missing_sentence_final_punct" };
  }

  // 「Issue a statement.」：以词条开头的短搭配且无 be/助动词 → 不是完整例句
  // 「Issue is hard today.」含 is → 放行
  const startsWithLemma =
    lemmaTokens.length > 0 &&
    tokens.length >= lemmaTokens.length &&
    tokens
      .slice(0, lemmaTokens.length)
      .every((t, i) => t.toLowerCase() === (lemmaTokens[i] || "").toLowerCase());
  if (
    startsWithLemma &&
    tokens.length <= 5 &&
    !EN_FINITE_HINT_RE.test(en)
  ) {
    return { ok: false, reason: "english_phrase_not_sentence" };
  }

  const glossBody = stripEnVocabExampleGlossLabel(String(gloss ?? ""));
  const hanCount = (glossBody.match(new RegExp(HAN_RE.source, "g")) || [])
    .length;
  // 中文已是整句，英文却只有过短短语
  if (hanCount >= 8 && tokens.length < 4) {
    return { ok: false, reason: "english_too_short_vs_gloss" };
  }

  return { ok: true };
}

export function isEnVocabExampleGlossLine(text: string): boolean {
  if (!text.trim()) return false;
  if (isEnVocabExampleEnglishLine(text)) return false;
  const body = stripEnVocabExampleGlossLabel(text);
  return HAN_RE.test(body);
}

export function parseEnVocabExampleSentenceItems(
  raw: string | null | undefined
): EnVocabExampleSentenceItem[] {
  const lines = splitEnVocabExampleSentenceLines(raw);
  const items: EnVocabExampleSentenceItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isEnVocabExampleEnglishLine(line)) {
      i += 1;
      continue;
    }
    const text = line.trim();
    let gloss = "";
    if (i + 1 < lines.length && isEnVocabExampleGlossLine(lines[i + 1])) {
      gloss = formatEnVocabExampleGlossLine(lines[i + 1]);
      i += 2;
    } else {
      i += 1;
    }
    items.push({ text, gloss });
  }
  return items;
}

export function serializeEnVocabExampleSentenceItems(
  items: EnVocabExampleSentenceItem[]
): string {
  const lines: string[] = [];
  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;
    lines.push(text);
    const gloss = formatEnVocabExampleGlossLine(item.gloss);
    if (gloss) lines.push(gloss);
  }
  return lines.join("\n");
}

export function normalizeEnVocabExampleSentencesFormat(
  raw: string | null | undefined
): string | null {
  const items = parseEnVocabExampleSentenceItems(raw);
  if (!items.length) return null;
  return serializeEnVocabExampleSentenceItems(items);
}

export function normalizeEnVocabExampleSentencesSource(
  raw: string | null | undefined
): string | null {
  const t = String(raw ?? "").trim();
  return t || null;
}
