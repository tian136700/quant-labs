import "server-only";

import type { JpVocabKind } from "@/lib/types";
import { jpVocabDbState } from "./state";
import { ensureVocabWordSchema, seedIfEmpty } from "./helpers";

/** 全量导出用轻量词条（不含备注/例句等大字段，避免 1102） */
export type JpVocabLemmaExportItem = {
  id: number;
  word: string;
  kind: JpVocabKind;
};

/**
 * 列出线上全部词条 lemma（仅 id / word / kind）。
 * 供外部项目下载后做「已有词不再做教案」比对。
 */
export async function listJpVocabLemmasForDownload(
  db: D1Database,
  kind?: JpVocabKind
): Promise<JpVocabLemmaExportItem[]> {
  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (jpVocabDbState.devStoreEnabled) {
    return jpVocabDbState.devWords
      .filter((item) => (kind ? item.kind === kind : true))
      .map((item) => ({
        id: item.id,
        word: item.word,
        kind: item.kind,
      }))
      .sort((a, b) => {
        const byWord = a.word.localeCompare(b.word, "ja");
        if (byWord !== 0) return byWord;
        return a.id - b.id;
      });
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
    kind: row.kind === "grammar" ? "grammar" : "word",
  }));
}
