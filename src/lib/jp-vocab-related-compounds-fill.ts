import "server-only";

import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import {
  JP_VOCAB_RELATED_COMPOUNDS_PROMPT_HINT,
  hasJpVocabRelatedCompounds,
} from "@/lib/jp-vocab-related-compounds";

/** 词表里「一个汉字」的单词（口 / 手 / 目…），非假名单字 */
const SINGLE_KANJI_RE = /^[\u4E00-\u9FFF々]$/;

export type JpVocabMissingRelatedCompoundsRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  /** 可直接喂给线上模型的 prompt */
  prompt: string;
};

export type ListJpVocabMissingRelatedCompoundsOptions = {
  limit?: number;
  /**
   * 默认 false：含多字词（会社員拆分助记）与单汉字（口→入口）。
   * 传 true 时仅单汉字（旧临时任务兼容）。
   */
  single_kanji_only?: boolean;
};

export function isJpVocabSingleKanjiWord(word: string): boolean {
  return SINGLE_KANJI_RE.test(String(word || "").trim());
}

export function buildJpVocabRelatedCompoundsOnlyAiPrompt(input: {
  word: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
}): string {
  const word = String(input.word || "").trim();
  const reading = String(input.reading || "").trim();
  const meaning = String(input.meaning || "").trim();
  const pos = String(input.pos || "").trim();
  const multiKanji =
    Array.from(word).filter((ch) => /[\u4E00-\u9FFF々]/.test(ch)).length >= 2;
  const focus = multiKanji
    ? [
        "本词是多字词：请优先拆成自然部件词，再给能产字旁举 1 个常见词。",
        "例：会社員 → 会社(かいしゃ)：公司｜名词；店員(てんいん)：店员｜名词。",
        "部件读音须是本词读音的一段；同旁词该字读音须与本词一致。",
      ].join("\n")
    : "本词是单汉字：请写含本字且同读（可连浊）的简单构词（例：口 → 入口(いりぐち)：入口｜名词）。";
  const lines = [
    "请为下面这个日语单词写出「相关构词」（助记用）。",
    `词条：${word}`,
    reading ? `读音：${reading}` : null,
    meaning ? `释义：${meaning}` : null,
    pos ? `词性：${pos}` : null,
    "",
    focus,
    "",
    JP_VOCAB_RELATED_COMPOUNDS_PROMPT_HINT,
    "",
    "只输出相关构词正文（多行或空）。",
    "每行须带词性：漢字(かな)：中文｜词性（名词/他动词/自动词/动词…）。",
    "禁止编号、禁止 markdown、禁止解释段落。",
    "若没有自然相关词，只输出空（不要硬凑）。",
  ].filter((x) => x != null) as string[];
  return lines.join("\n");
}

/**
 * 缺相关构词的单词队列。
 * 默认：含汉字的单词 + related_compounds 空 + 尚未写过 source（避免「无相关」死循环）。
 * single_kanji_only=true 时仅单汉字。
 */
export async function listJpVocabWordsMissingRelatedCompounds(
  db: D1Database,
  options: ListJpVocabMissingRelatedCompoundsOptions = {}
): Promise<{
  missing: JpVocabMissingRelatedCompoundsRow[];
  total_missing: number;
}> {
  await ensureJpVocabWordSchema(db);
  const singleOnly = options.single_kanji_only === true;
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : 20;

  // 单汉字时多取一些再在 TS 里滤；多字词直接按 limit 取
  const fetchLimit = singleOnly ? Math.min(Math.max(limit * 8, 80), 400) : limit;

  const result = await db
    .prepare(
      `SELECT id, word, kind, reading, meaning, pos, related_compounds, related_compounds_source
       FROM jp_vocab_word
       WHERE kind = 'word'
         AND (related_compounds IS NULL OR TRIM(related_compounds) = '')
         AND (related_compounds_source IS NULL OR TRIM(related_compounds_source) = '')
       ORDER BY id
       LIMIT ?1`
    )
    .bind(fetchLimit)
    .all<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
      pos: string | null;
      related_compounds: string | null;
      related_compounds_source: string | null;
    }>();

  const rows = result.results ?? [];
  const missing: JpVocabMissingRelatedCompoundsRow[] = [];
  for (const row of rows) {
    const word = String(row.word || "").trim();
    if (hasJpVocabRelatedCompounds(row.related_compounds)) continue;
    // 纯假名词（如フランスじん）无汉字可拆，不进队
    if (!/[\u4E00-\u9FFF々]/.test(word)) continue;
    if (singleOnly && !isJpVocabSingleKanjiWord(word)) continue;
    missing.push({
      id: Number(row.id),
      word,
      kind: "word",
      reading: row.reading != null ? String(row.reading).trim() || null : null,
      meaning: row.meaning != null ? String(row.meaning).trim() || null : null,
      pos: row.pos != null ? String(row.pos).trim() || null : null,
      prompt: buildJpVocabRelatedCompoundsOnlyAiPrompt({
        word,
        reading: row.reading,
        meaning: row.meaning,
        pos: row.pos,
      }),
    });
    if (missing.length >= limit) break;
  }

  // total：粗算（同条件再数；单汉字在 TS 滤，总数用「当前批估」或二次扫）
  const countRow = await db
    .prepare(
      `SELECT id, word FROM jp_vocab_word
       WHERE kind = 'word'
         AND (related_compounds IS NULL OR TRIM(related_compounds) = '')
         AND (related_compounds_source IS NULL OR TRIM(related_compounds_source) = '')
       ORDER BY id
       LIMIT 2000`
    )
    .all<{ id: number; word: string }>();
  let total = 0;
  for (const r of countRow.results ?? []) {
    const w = String(r.word || "").trim();
    if (!/[\u4E00-\u9FFF々]/.test(w)) continue;
    if (singleOnly && !isJpVocabSingleKanjiWord(w)) continue;
    total += 1;
  }

  return { missing, total_missing: total };
}
