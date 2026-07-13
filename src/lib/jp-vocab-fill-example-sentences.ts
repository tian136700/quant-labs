import "server-only";

import {
  lookupJpVocabExampleSentences,
  JP_VOCAB_EXAMPLE_SENTENCES_CATALOG,
} from "@/lib/jp-vocab-example-sentences-catalog";

export type JpVocabMissingExampleSentenceRow = {
  id: number;
  word: string;
  kind: string;
  suggested: string | null;
};

export type JpVocabFillExampleSentenceApplied = {
  id: number;
  word: string;
  example_sentences: string;
};

export type JpVocabFillExampleSentencesResult = {
  updated: number;
  applied: JpVocabFillExampleSentenceApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: JpVocabMissingExampleSentenceRow[];
  catalog_size: number;
};

async function updateExampleSentencesIfEmpty(
  db: D1Database,
  wordId: number,
  exampleSentences: string,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET example_sentences = ?1, updated_at = datetime('now')
       WHERE id = ?2
         AND (example_sentences IS NULL OR TRIM(example_sentences) = '')`
    )
    .bind(exampleSentences.trim(), wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function listJpVocabWordsMissingExampleSentences(
  db: D1Database
): Promise<JpVocabMissingExampleSentenceRow[]> {
  const result = await db
    .prepare(
      `SELECT id, word, kind FROM jp_vocab_word
       WHERE example_sentences IS NULL OR TRIM(example_sentences) = ''
       ORDER BY id`
    )
    .all<{ id: number; word: string; kind: string }>();

  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    word: String(row.word),
    kind: String(row.kind),
    suggested: lookupJpVocabExampleSentences(String(row.word)),
  }));
}

export async function scanJpVocabWordsMissingExampleSentences(
  db: D1Database
): Promise<JpVocabFillExampleSentencesResult> {
  const missing = await listJpVocabWordsMissingExampleSentences(db);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    catalog_size: Object.keys(JP_VOCAB_EXAMPLE_SENTENCES_CATALOG).length,
  };
}

export async function applyJpVocabExampleSentenceUpdates(
  db: D1Database,
  updates: Array<{ word_id: number; example_sentences: string }>,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillExampleSentencesResult> {
  const dryRun = Boolean(options.dryRun);
  const applied: JpVocabFillExampleSentenceApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    const exampleSentences = String(item.example_sentences ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !exampleSentences) continue;

    const row = await db
      .prepare(`SELECT id, word FROM jp_vocab_word WHERE id = ?1`)
      .bind(wordId)
      .first<{ id: number; word: string }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }

    const changed = await updateExampleSentencesIfEmpty(
      db,
      wordId,
      exampleSentences,
      dryRun
    );
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        example_sentences: exampleSentences,
      });
    } else {
      skipped.push({ id: wordId, word: String(row.word), reason: "already_filled" });
    }
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
    catalog_size: Object.keys(JP_VOCAB_EXAMPLE_SENTENCES_CATALOG).length,
  };
}

/** 用内置词表补全尚未填写例句的词条（仅填空，不覆盖已有内容） */
export async function fillJpVocabExampleSentencesFromCatalog(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillExampleSentencesResult> {
  const missing = await listJpVocabWordsMissingExampleSentences(db);
  const updates = missing
    .filter((row) => row.suggested)
    .map((row) => ({
      word_id: row.id,
      example_sentences: row.suggested as string,
    }));
  return applyJpVocabExampleSentenceUpdates(db, updates, options);
}
