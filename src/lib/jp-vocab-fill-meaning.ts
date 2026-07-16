import "server-only";

export type JpVocabMissingMeaningRow = {
  id: number;
  word: string;
  reading: string | null;
  kind: string;
};

export type JpVocabFillMeaningApplied = {
  id: number;
  word: string;
  meaning: string;
};

export type JpVocabFillMeaningResult = {
  updated: number;
  applied: JpVocabFillMeaningApplied[];
  skipped: Array<{ id: number; word: string }>;
  dry_run: boolean;
  missing?: JpVocabMissingMeaningRow[];
};

export async function listJpVocabWordsMissingMeaning(
  db: D1Database
): Promise<JpVocabMissingMeaningRow[]> {
  const result = await db
    .prepare(
      `SELECT id, word, reading, kind FROM jp_vocab_word
       WHERE meaning IS NULL OR TRIM(meaning) = ''
       ORDER BY id`
    )
    .all<{
      id: number;
      word: string;
      reading: string | null;
      kind: string;
    }>();

  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    word: String(row.word),
    reading: row.reading != null ? String(row.reading) : null,
    kind: String(row.kind),
  }));
}

async function updateMeaningIfEmpty(
  db: D1Database,
  wordId: number,
  meaning: string,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET meaning = ?1, updated_at = datetime('now')
       WHERE id = ?2
         AND (meaning IS NULL OR TRIM(meaning) = '')`
    )
    .bind(meaning.trim(), wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function scanJpVocabWordsMissingMeaning(
  db: D1Database
): Promise<JpVocabFillMeaningResult> {
  const missing = await listJpVocabWordsMissingMeaning(db);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
  };
}

export async function applyJpVocabMeaningUpdates(
  db: D1Database,
  updates: Array<{ word_id: number; meaning: string }>,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillMeaningResult> {
  const dryRun = Boolean(options.dryRun);
  const applied: JpVocabFillMeaningApplied[] = [];
  const skipped: Array<{ id: number; word: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    const meaning = String(item.meaning ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !meaning) continue;

    const row = await db
      .prepare(`SELECT id, word, kind FROM jp_vocab_word WHERE id = ?1`)
      .bind(wordId)
      .first<{ id: number; word: string; kind: string }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId) });
      continue;
    }

    const changed = await updateMeaningIfEmpty(db, wordId, meaning, dryRun);
    if (changed) {
      updated += 1;
      applied.push({ id: wordId, word: String(row.word), meaning });
    } else {
      skipped.push({ id: wordId, word: String(row.word) });
    }
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
  };
}
