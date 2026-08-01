import { JP_VOCAB_JUKUGO_READING } from "@/lib/jp-vocab-jukugo-furigana";

/**
 * 相关构词：含本词汉字/读音的简单词（口→入口），助记用。
 * 存库多行：每行「漢字(かな)：中文」；连浊算同一读音族。
 */

export const JP_VOCAB_RELATED_COMPOUNDS_LABEL = "相关构词";

export const JP_VOCAB_RELATED_COMPOUNDS_PROMPT_HINT = `相关构词（仅单词；与读音/释义/例句同一次输出；语法填 ""）：
- 目的：用更简单、好记的含本字词帮记本词（例：口 → 入口(いりぐち)：入口）。
- 条数：没有自然相关词 → 填 ""（禁止硬凑）；只有 1～2 个就写 1～2；多则最多 4～5 条。
- 须含本词汉字（或同一读音族，连浊如 くち→ぐち 可）；优先 N5～N4 日常词，禁止商务/难词。
- 每行格式：漢字(かな)：简短中文释义；假名须正确（入口≠いりくち）。
- 例：
入口(いりぐち)：入口
出口(でぐち)：出口`;

const LINE_RE =
  /^([\u4E00-\u9FFF々〆ヶぁ-んァ-ンー]+)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]\s*[:：]\s*(.+)$/;

function toHiragana(text: string): string {
  return String(text || "")
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[^ぁ-んー]/g, "");
}

/** 清音↔浊音↔半浊简易对照（连浊族匹配） */
function voiceFamily(hira: string): string {
  const pairs: Array<[string, string]> = [
    ["か", "が"],
    ["き", "ぎ"],
    ["く", "ぐ"],
    ["け", "げ"],
    ["こ", "ご"],
    ["さ", "ざ"],
    ["し", "じ"],
    ["す", "ず"],
    ["せ", "ぜ"],
    ["そ", "ぞ"],
    ["た", "だ"],
    ["ち", "ぢ"],
    ["つ", "づ"],
    ["て", "で"],
    ["と", "ど"],
    ["は", "ば"],
    ["ひ", "び"],
    ["ふ", "ぶ"],
    ["へ", "べ"],
    ["ほ", "ぼ"],
    ["は", "ぱ"],
    ["ひ", "ぴ"],
    ["ふ", "ぷ"],
    ["へ", "ぺ"],
    ["ほ", "ぽ"],
  ];
  let s = hira;
  for (const [a, b] of pairs) {
    s = s.split(b).join(a);
  }
  return s;
}

export type JpVocabRelatedCompoundItem = {
  surface: string;
  reading: string;
  gloss: string;
  /** 展示用：漢字(かな)：中文 */
  line: string;
};

export function parseJpVocabRelatedCompounds(
  raw: string | null | undefined
): JpVocabRelatedCompoundItem[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  const out: JpVocabRelatedCompoundItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const surface = m[1]!;
    const reading = toHiragana(m[2]!);
    const gloss = m[3]!.trim();
    if (!surface || !reading || !gloss) continue;
    out.push({
      surface,
      reading,
      gloss,
      line: `${surface}(${reading})：${gloss}`,
    });
  }
  return out;
}

export function hasJpVocabRelatedCompounds(
  raw: string | null | undefined
): boolean {
  return parseJpVocabRelatedCompounds(raw).length > 0;
}

export function normalizeJpVocabRelatedCompoundsText(
  raw: string | null | undefined
): string | null {
  const items = parseJpVocabRelatedCompounds(raw);
  if (items.length === 0) return null;
  return items.map((i) => i.line).join("\n");
}

function lemmaKanjiChars(lemma: string): string[] {
  return Array.from(String(lemma || "")).filter((ch) =>
    /[\u4E00-\u9FFF々]/.test(ch)
  );
}

function compoundSharesLemma(
  surface: string,
  reading: string,
  lemma: string,
  lemmaReading: string | null | undefined
): boolean {
  const kanjis = lemmaKanjiChars(lemma);
  if (kanjis.length > 0) {
    if (kanjis.some((k) => surface.includes(k))) return true;
  }
  const base = toHiragana(lemmaReading || "");
  if (!base) return kanjis.length === 0;
  const fam = voiceFamily(base);
  const rFam = voiceFamily(reading);
  return rFam.includes(fam) || fam.includes(rFam);
}

export type JpVocabRelatedCompoundsValidateResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * 校验相关构词块。空串允许（稀有词可无）。
 * 有内容时：1～5 行、格式正确、须与本词汉字/读音族相关。
 */
export function validateJpVocabRelatedCompoundsAiOutput(
  raw: string | null | undefined,
  input: { word: string; reading?: string | null; kind?: string | null }
): JpVocabRelatedCompoundsValidateResult {
  const kind = input.kind === "grammar" ? "grammar" : "word";
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { ok: true, text: "" };
  }
  if (kind === "grammar") {
    return { ok: false, reason: "related_compounds_word_only" };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 5) {
    return { ok: false, reason: "related_compounds_too_many" };
  }

  const items: JpVocabRelatedCompoundItem[] = [];
  for (const line of lines) {
    const m = LINE_RE.exec(line);
    if (!m) {
      return { ok: false, reason: "related_compounds_bad_line" };
    }
    const surface = m[1]!;
    const reading = toHiragana(m[2]!);
    const gloss = m[3]!.trim();
    if (!surface || !reading || !gloss) {
      return { ok: false, reason: "related_compounds_bad_line" };
    }
    if (/[\u3040-\u30ff]/.test(gloss) && !/[\u4e00-\u9fff]/.test(gloss)) {
      // 译文应是中文；允许夹少量汉字词，禁止纯假名
      return { ok: false, reason: "related_compounds_gloss_not_chinese" };
    }
    if (
      !compoundSharesLemma(surface, reading, input.word, input.reading)
    ) {
      return { ok: false, reason: "related_compounds_unrelated" };
    }
    // 不要把本词自己当「相关构词」
    if (surface === String(input.word || "").trim()) {
      return { ok: false, reason: "related_compounds_is_self" };
    }
    const expectedReading = JP_VOCAB_JUKUGO_READING[surface];
    if (expectedReading && reading !== expectedReading) {
      return { ok: false, reason: "wrong_jukugo_furigana" };
    }
    items.push({
      surface,
      reading,
      gloss,
      line: `${surface}(${reading})：${gloss}`,
    });
  }

  if (items.length === 0) {
    return { ok: true, text: "" };
  }
  return { ok: true, text: items.map((i) => i.line).join("\n") };
}
