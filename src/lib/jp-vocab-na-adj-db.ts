import "server-only";

import { normalizeJpVocabNaAdjStoredEntry } from "@/lib/jp-vocab-na-adj";

export type JpVocabNaAdjNormalizedRow = {
  id: number;
  from_word: string;
  to_word: string;
  from_reading: string | null;
  to_reading: string | null;
};

/**
 * 全表把な形容词「〜だ」剥成词干，读音同步去掉尾「だ」。
 * 补全 list_missing / 迁移脚本前置调用；无待改行时只做一次轻量 SELECT。
 */
export async function normalizeJpVocabNaAdjRowsInDb(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<{
  updated: number;
  applied: JpVocabNaAdjNormalizedRow[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
}> {
  const dryRun = Boolean(options.dryRun);
  const result = await db
    .prepare(
      `SELECT id, word, reading FROM jp_vocab_word
       WHERE word LIKE '%だ'
       ORDER BY id`
    )
    .all<{ id: number; word: string; reading: string | null }>();

  const applied: JpVocabNaAdjNormalizedRow[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];

  for (const row of result.results ?? []) {
    const id = Number(row.id);
    const fromWord = String(row.word ?? "");
    const fromReading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const next = normalizeJpVocabNaAdjStoredEntry(fromWord, fromReading);
    if (next.word === fromWord && next.reading === fromReading) {
      continue;
    }
    if (!next.word) {
      skipped.push({ id, word: fromWord, reason: "word_required" });
      continue;
    }

    const dup = await db
      .prepare(
        `SELECT id FROM jp_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1`
      )
      .bind(next.word, id)
      .first<{ id: number }>();
    if (dup) {
      skipped.push({ id, word: fromWord, reason: "word_duplicate" });
      continue;
    }

    if (!dryRun) {
      await db
        .prepare(
          `UPDATE jp_vocab_word
           SET word = ?1, reading = ?2, updated_at = datetime('now')
           WHERE id = ?3`
        )
        .bind(next.word, next.reading, id)
        .run();
    }

    applied.push({
      id,
      from_word: fromWord,
      to_word: next.word,
      from_reading: fromReading,
      to_reading: next.reading,
    });
  }

  return {
    updated: applied.length,
    applied,
    skipped,
    dry_run: dryRun,
  };
}
