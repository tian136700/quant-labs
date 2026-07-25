import "server-only";

import { normalizeJpVocabNaAdjStoredEntry } from "@/lib/jp-vocab-na-adj";

export type JpVocabNaAdjNormalizedRow = {
  id: number;
  from_word: string;
  to_word: string;
  from_reading: string | null;
  to_reading: string | null;
};

/** 同一 Worker isolate 内：扫过且无待改行后，跳过重复全表扫（防 fill-* 每秒 list_missing → 1102） */
let naAdjNormalizeCleanUntil = 0;
const NA_ADJ_NORMALIZE_CLEAN_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * 全表把な形容词「〜だ」剥成词干，读音同步去掉尾「だ」。
 * 迁移 / 显式 mode 可 force；日常 list_missing 依赖 isolate 缓存，无待改时不重复扫。
 */
export async function normalizeJpVocabNaAdjRowsInDb(
  db: D1Database,
  options: { dryRun?: boolean; force?: boolean } = {}
): Promise<{
  updated: number;
  applied: JpVocabNaAdjNormalizedRow[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  cached_skip?: boolean;
}> {
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const now = Date.now();
  if (
    !force &&
    !dryRun &&
    naAdjNormalizeCleanUntil > now
  ) {
    return {
      updated: 0,
      applied: [],
      skipped: [],
      dry_run: false,
      cached_skip: true,
    };
  }

  const result = await db
    .prepare(
      `SELECT id, word, reading FROM jp_vocab_word
       WHERE word LIKE '%だ'
       ORDER BY id`
    )
    .all<{ id: number; word: string; reading: string | null }>();

  const applied: JpVocabNaAdjNormalizedRow[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  const updates: Array<{ id: number; word: string; reading: string | null }> = [];

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

    updates.push({ id, word: next.word, reading: next.reading });
    applied.push({
      id,
      from_word: fromWord,
      to_word: next.word,
      from_reading: fromReading,
      to_reading: next.reading,
    });
  }

  if (!dryRun && updates.length > 0) {
    // D1 batch：避免逐条 await 把 CPU 拖进 1102
    const stmts = updates.map((u) =>
      db
        .prepare(
          `UPDATE jp_vocab_word
           SET word = ?1, reading = ?2, updated_at = datetime('now')
           WHERE id = ?3`
        )
        .bind(u.word, u.reading, u.id)
    );
    await db.batch(stmts);
  }

  if (!dryRun) {
    // 无论有无更新：本 isolate 认为已干净，TTL 内不再全表扫
    naAdjNormalizeCleanUntil = Date.now() + NA_ADJ_NORMALIZE_CLEAN_TTL_MS;
  }

  return {
    updated: applied.length,
    applied,
    skipped,
    dry_run: dryRun,
  };
}
