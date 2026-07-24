import "server-only";

import { ensureEnVocabWordSchema } from "@/lib/en-vocab-db";
import {
  normalizeEnVocabIpa,
  normalizeEnVocabReadingSource,
  validateEnVocabIpa,
} from "@/lib/en-vocab-reading";

export type EnVocabMissingReadingRow = {
  id: number;
  word: string;
  kind: string;
};

export type EnVocabFillReadingApplied = {
  id: number;
  word: string;
  reading: string;
  reading_source: string | null;
};

export type EnVocabFillReadingResult = {
  updated: number;
  applied: EnVocabFillReadingApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: EnVocabMissingReadingRow[];
  total_missing?: number;
};

export type ListEnVocabMissingReadingOptions = {
  limit?: number;
};

export async function countEnVocabWordsMissingReading(
  db: D1Database
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM en_vocab_word
       WHERE kind != 'grammar'
         AND (reading IS NULL OR TRIM(reading) = '')`
    )
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listEnVocabWordsMissingReading(
  db: D1Database,
  options: ListEnVocabMissingReadingOptions = {}
): Promise<EnVocabMissingReadingRow[]> {
  await ensureEnVocabWordSchema(db);
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  let sql = `SELECT id, word, kind FROM en_vocab_word
       WHERE kind != 'grammar'
         AND (reading IS NULL OR TRIM(reading) = '')
       ORDER BY id`;
  if (limit != null) {
    sql += ` LIMIT ?1`;
  }

  const result = await (
    limit != null ? db.prepare(sql).bind(limit) : db.prepare(sql)
  ).all<{ id: number; word: string; kind: string }>();

  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    word: String(row.word),
    kind: String(row.kind),
  }));
}

export async function scanEnVocabWordsMissingReading(
  db: D1Database,
  options: ListEnVocabMissingReadingOptions = {}
): Promise<EnVocabFillReadingResult> {
  const [missing, total_missing] = await Promise.all([
    listEnVocabWordsMissingReading(db, options),
    countEnVocabWordsMissingReading(db),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
  };
}

async function updateReadingIfEmpty(
  db: D1Database,
  wordId: number,
  reading: string,
  source: string | null,
  dryRun: boolean,
  force = false
): Promise<boolean> {
  if (dryRun) return true;
  const result = force
    ? await db
        .prepare(
          `UPDATE en_vocab_word
           SET reading = ?1,
               reading_source = ?2,
               updated_at = datetime('now')
           WHERE id = ?3
             AND kind != 'grammar'`
        )
        .bind(reading.trim(), source, wordId)
        .run()
    : await db
        .prepare(
          `UPDATE en_vocab_word
           SET reading = ?1,
               reading_source = ?2,
               updated_at = datetime('now')
           WHERE id = ?3
             AND kind != 'grammar'
             AND (reading IS NULL OR TRIM(reading) = '')`
        )
        .bind(reading.trim(), source, wordId)
        .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export type EnVocabReadingUpdateItem = {
  word_id: number;
  reading: string;
  source?: string | null;
};

export async function applyEnVocabReadingUpdates(
  db: D1Database,
  updates: EnVocabReadingUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
    defaultSource?: string | null;
    /** 线上付费整词刷新：覆盖已有音标 */
    force?: boolean;
  } = {}
): Promise<EnVocabFillReadingResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const force = Boolean(options.force);
  const defaultSource = normalizeEnVocabReadingSource(options.defaultSource);
  const applied: EnVocabFillReadingApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let reading = String(item.reading ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !reading) continue;

    const source =
      normalizeEnVocabReadingSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(`SELECT id, word, kind FROM en_vocab_word WHERE id = ?1`)
      .bind(wordId)
      .first<{ id: number; word: string; kind: string }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }
    if (row.kind === "grammar") {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "grammar_skipped",
      });
      continue;
    }

    if (validateFormat) {
      const validated = validateEnVocabIpa(reading);
      if (!validated.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `invalid_format:${validated.reason}`,
        });
        continue;
      }
      reading = validated.text;
    } else {
      // 线上 force：原样写回（normalize 失败也不拒）
      reading = normalizeEnVocabIpa(reading) || reading;
    }

    const changed = await updateReadingIfEmpty(
      db,
      wordId,
      reading,
      source,
      dryRun,
      force
    );
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        reading,
        reading_source: source,
      });
    } else {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "already_filled",
      });
    }
  }

  return { updated, applied, skipped, dry_run: dryRun };
}
