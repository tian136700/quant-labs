import { JP_VOCAB_JUKUGO_READING } from "@/lib/jp-vocab-jukugo-furigana";

/**
 * 相关构词：含本词汉字、且读音与本词一致（含连浊）的简单词，助记用。
 * 例：口(くち)→入口(いりぐち)；事(こと)勿配食事(しょくじ)（じ≠こと）。
 * 存库多行：每行「漢字(かな)：中文」。
 */

export const JP_VOCAB_RELATED_COMPOUNDS_LABEL = "相关构词";

/**
 * @deprecated 卡片无相关词时整块留空，不再展示占位文案。
 * 仍导出仅供旧引用/测试识别；UI 勿再渲染此串。
 */
export const JP_VOCAB_RELATED_COMPOUNDS_EMPTY_CHECKED =
  "已通过AI获取，但暂无相关词汇";

export const JP_VOCAB_RELATED_COMPOUNDS_PROMPT_HINT = `相关构词（仅单词；与读音/释义/例句同一次输出；语法填 ""）：
- 目的：用含本字、且读音相同的简单词帮记本词（例：口(くち) → 入口(いりぐち)：入口）。
- 读音必须一致：构词里本字的读法须与本词读音相同（允许连浊：くち→ぐち、こと→ごと）；禁止不同音读（事=こと 勿写 食事/大事 的「じ」）。
- 条数：没有自然同读相关词 → 填 ""（禁止硬凑）；只有 1～2 个就写 1～2；多则最多 4～5 条。
- 须含本词汉字；优先 N5～N4 日常词，禁止商务/难词。
- 【禁止本词】不要把词条本身写进相关构词（研修生≠再写研修生；企業≠再写企業）。相关=别的词。
- 每行格式：漢字(かな)：简短中文释义；假名须正确（入口≠いりくち）。
- 【整词假名·必守】假名括号包住整词，禁止词中拆标：✅決まり(きまり)：规定　❌決(き)まり：规定；✅知らせ(しらせ)：通知　❌知(し)らせ：通知。
- 一词多义：同一构词的多个中文义用中文逗号「，」连接（例：目上(めうえ)：上级，长辈）。禁止在释义里用分号「；」（分号只用于区分不同日语词）。
- 例：
入口(いりぐち)：入口
出口(でぐち)：出口
目上(めうえ)：上级，长辈`;

const LINE_RE =
  /^([\u4E00-\u9FFF々〆ヶぁ-んァ-ンー]+)[（(]([ぁ-んァ-ンヴヵヶー]+)[）)]\s*[:：]\s*(.+)$/;

/** 一词多义：把释义里的分号/斜杠等规范成中文逗号「，」 */
export function normalizeJpVocabRelatedCompoundGloss(gloss: string): string {
  return String(gloss || "")
    .trim()
    .replace(/[；;]+/g, "，")
    .replace(/[／/|｜]+/g, "，")
    .replace(/[、]+/g, "，")
    .replace(/\s*，\s*/g, "，")
    .replace(/^，+|，+$/g, "")
    .trim();
}

const VOICE_PAIRS: Array<[string, string]> = [
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

function toHiragana(text: string): string {
  return String(text || "")
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[^ぁ-んー]/g, "");
}

/** 本词读音的连浊/清浊变体（こと→ごと；くち→ぐち），便于同读助记 */
export function jpVocabReadingVoiceVariants(reading: string): string[] {
  const base = toHiragana(reading);
  if (!base) return [];
  const out = new Set<string>([base]);
  const chars = Array.from(base);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    for (const [a, b] of VOICE_PAIRS) {
      if (ch === a || ch === b) {
        const next = chars.slice();
        next[i] = ch === a ? b : a;
        out.add(next.join(""));
      }
    }
  }
  return Array.from(out);
}

export type JpVocabRelatedCompoundItem = {
  surface: string;
  reading: string;
  gloss: string;
  /** 存库行：漢字(かな)：中文 */
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
    const gloss = normalizeJpVocabRelatedCompoundGloss(m[3]!);
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

/** 复制用：漢字(かな) 中文；…； */
export function jpVocabRelatedCompoundsCopyText(
  items: readonly JpVocabRelatedCompoundItem[]
): string {
  if (!items.length) return "";
  return items.map((i) => `${i.surface}(${i.reading}) ${i.gloss}`).join("；") + "；";
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

/**
 * 构词须含本词汉字，且构词假名里能找到本词读音（或连浊变体）。
 * 事(こと) + 食事(しょくじ) → false；口(くち) + 入口(いりぐち) → true。
 */
export function compoundSharesLemmaSameReading(
  surface: string,
  compoundReading: string,
  lemma: string,
  lemmaReading: string | null | undefined
): boolean {
  const kanjis = lemmaKanjiChars(lemma);
  if (kanjis.length === 0) return false;
  if (!kanjis.some((k) => surface.includes(k))) return false;
  const base = toHiragana(lemmaReading || "");
  if (!base) {
    // 无本词读音时无法验同读，只要求含汉字
    return true;
  }
  const compound = toHiragana(compoundReading);
  const variants = jpVocabReadingVoiceVariants(base);
  return variants.some((v) => v.length > 0 && compound.includes(v));
}

export type JpVocabRelatedCompoundsValidateResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * 校验相关构词块。空串允许（稀有词可无）。
 * 有内容时：1～5 行、格式正确、须含本字且同读（含连浊）；不同音读行会被丢掉。
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

  const lemma = String(input.word || "").trim();
  const items: JpVocabRelatedCompoundItem[] = [];
  for (const line of lines) {
    const m = LINE_RE.exec(line);
    if (!m) {
      continue;
    }
    const surface = m[1]!;
    const reading = toHiragana(m[2]!);
    const gloss = normalizeJpVocabRelatedCompoundGloss(m[3]!);
    if (!surface || !reading || !gloss) {
      continue;
    }
    if (/[\u3040-\u30ff]/.test(gloss) && !/[\u4e00-\u9fff]/.test(gloss)) {
      return { ok: false, reason: "related_compounds_gloss_not_chinese" };
    }
    // Claude 常把本词再抄一行（或写「同词条」）→ 丢掉该行，勿拒整批读音/释义/例句
    if (surface === lemma) {
      continue;
    }
    const expectedReading = JP_VOCAB_JUKUGO_READING[surface];
    if (expectedReading && reading !== expectedReading) {
      return { ok: false, reason: "wrong_jukugo_furigana" };
    }
    if (
      !compoundSharesLemmaSameReading(
        surface,
        reading,
        input.word,
        input.reading
      )
    ) {
      continue;
    }
    items.push({
      surface,
      reading,
      gloss,
      line: `${surface}(${reading})：${gloss}`,
    });
  }

  // 本词 / 不同音读 / 坏行（如決(き)まり）剥光 → 当作无相关，勿硬拒整批例句
  if (items.length === 0) {
    return { ok: true, text: "" };
  }
  return { ok: true, text: items.map((i) => i.line).join("\n") };
}

/** 展示前过滤：丢掉不同音读的旧脏数据 */
export function filterJpVocabRelatedCompoundsSameReading(
  items: readonly JpVocabRelatedCompoundItem[],
  lemma: string,
  lemmaReading: string | null | undefined
): JpVocabRelatedCompoundItem[] {
  return items.filter((item) =>
    compoundSharesLemmaSameReading(
      item.surface,
      item.reading,
      lemma,
      lemmaReading
    )
  );
}
