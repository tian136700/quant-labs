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
