import "server-only";

import type { JpVocabKind } from "@/lib/types";
import { listIncompleteJpLessonWordLemmas } from "@/lib/jp-lesson-incomplete-word-lemmas";
import { jpVocabDbState } from "./state";
import { ensureVocabWordSchema, seedIfEmpty } from "./helpers";

/** 全量导出用轻量词条（不含备注/例句等大字段，避免 1102） */
export type JpVocabLemmaExportItem = {
  id: number;
  word: string;
  kind: JpVocabKind;
};

function sortLemmaExportItems(
  a: JpVocabLemmaExportItem,
  b: JpVocabLemmaExportItem
): number {
  const byWord = a.word.localeCompare(b.word, "ja");
  if (byWord !== 0) return byWord;
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
  return a.id - b.id;
}

async function listVocabLemmasOnly(
  db: D1Database,
  kind?: JpVocabKind
): Promise<JpVocabLemmaExportItem[]> {
  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devWords
      .filter((item) => (kind ? item.kind === kind : true))
      .map((item) => ({
        id: item.id,
        word: item.word,
        kind: item.kind,
      }))
      .sort(sortLemmaExportItems);
  }

  const result = kind
    ? await db
        .prepare(
          `SELECT id, word, kind FROM jp_vocab_word
           WHERE kind = ?1
           ORDER BY word COLLATE NOCASE ASC, id ASC`
        )
        .bind(kind)
        .all<{ id: number; word: string; kind: string }>()
    : await db
        .prepare(
          `SELECT id, word, kind FROM jp_vocab_word
           ORDER BY word COLLATE NOCASE ASC, id ASC`
        )
        .all<{ id: number; word: string; kind: string }>();

  return (result.results || []).map((row) => ({
    id: Number(row.id),
    word: String(row.word ?? "").trim(),
    kind: row.kind === "grammar" ? ("grammar" as const) : ("word" as const),
  }));
}

/**
 * 列出线上全部词条 lemma（仅 id / word / kind）。
 * 供外部项目下载后做「已有词不再做教案」比对。
 *
 * - kind=grammar：只返回词库语法（不合并新课语法）
 * - kind=word / any：词库 + 日语新课「学习中/未完成」里的单词，按 word 去重
 * - 仅存在于新课、尚未进词库的单词 id=0
 */
export async function listJpVocabLemmasForDownload(
  db: D1Database,
  kind?: JpVocabKind
): Promise<JpVocabLemmaExportItem[]> {
  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  const vocabItems = await listVocabLemmasOnly(db, kind);

  // 语法：只下词库，不拉新课语法
  if (kind === "grammar") {
    return vocabItems;
  }

  const lessonWords = await listIncompleteJpLessonWordLemmas(db);
  if (!lessonWords.length) {
    return vocabItems.sort(sortLemmaExportItems);
  }

  const seenWords = new Set(
    vocabItems
      .filter((item) => item.kind === "word")
      .map((item) => item.word.trim().toLowerCase())
      .filter(Boolean)
  );

  const merged = [...vocabItems];
  for (const word of lessonWords) {
    const key = word.trim().toLowerCase();
    if (!key || seenWords.has(key)) continue;
    seenWords.add(key);
    merged.push({ id: 0, word, kind: "word" });
  }

  return merged.sort(sortLemmaExportItems);
}
