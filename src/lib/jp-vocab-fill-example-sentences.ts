import "server-only";

import {
  lookupJpVocabExampleSentences,
  JP_VOCAB_EXAMPLE_SENTENCES_CATALOG,
} from "@/lib/jp-vocab-example-sentences-catalog";
import {
  jpVocabExampleSentencesNeedGlossFill,
  normalizeJpVocabExampleSentencesFormat,
  parseJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";

export type JpVocabMissingExampleSentenceRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  suggested: string | null;
};

export type JpVocabIncompleteExampleGlossRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  example_sentences: string;
  missing_gloss_count: number;
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
  incomplete_gloss?: JpVocabIncompleteExampleGlossRow[];
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

async function updateExampleSentencesOverwrite(
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
       WHERE id = ?2`
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
      `SELECT id, word, kind, reading, meaning FROM jp_vocab_word
       WHERE example_sentences IS NULL OR TRIM(example_sentences) = ''
       ORDER BY id`
    )
    .all<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    word: String(row.word),
    kind: String(row.kind),
    reading: row.reading != null ? String(row.reading).trim() || null : null,
    meaning: row.meaning != null ? String(row.meaning).trim() || null : null,
    suggested: lookupJpVocabExampleSentences(String(row.word)),
  }));
}

export async function listJpVocabWordsIncompleteExampleGloss(
  db: D1Database
): Promise<JpVocabIncompleteExampleGlossRow[]> {
  const result = await db
    .prepare(
      `SELECT id, word, kind, reading, meaning, example_sentences FROM jp_vocab_word
       WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''
       ORDER BY id`
    )
    .all<{
      id: number;
      word: string;
      kind: string;
      reading: string | null;
      meaning: string | null;
      example_sentences: string;
    }>();

  const out: JpVocabIncompleteExampleGlossRow[] = [];
  for (const row of result.results ?? []) {
    const example = String(row.example_sentences ?? "");
    if (!jpVocabExampleSentencesNeedGlossFill(example)) continue;
    const missing = parseJpVocabExampleSentenceItems(example).filter(
      (item) => item.glossLines.length === 0
    ).length;
    out.push({
      id: Number(row.id),
      word: String(row.word),
      kind: String(row.kind),
      reading: row.reading != null ? String(row.reading).trim() || null : null,
      meaning: row.meaning != null ? String(row.meaning).trim() || null : null,
      example_sentences: example,
      missing_gloss_count: missing,
    });
  }
  return out;
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

export async function scanJpVocabWordsIncompleteExampleGloss(
  db: D1Database
): Promise<JpVocabFillExampleSentencesResult> {
  const incomplete_gloss = await listJpVocabWordsIncompleteExampleGloss(db);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    incomplete_gloss,
    catalog_size: Object.keys(JP_VOCAB_EXAMPLE_SENTENCES_CATALOG).length,
  };
}

/** 仅为已有译义补「译文：」前缀，不翻译 */
export async function normalizeJpVocabExampleSentencesFormatInDb(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillExampleSentencesResult> {
  const dryRun = Boolean(options.dryRun);
  const result = await db
    .prepare(
      `SELECT id, word, example_sentences FROM jp_vocab_word
       WHERE example_sentences IS NOT NULL AND TRIM(example_sentences) != ''
       ORDER BY id`
    )
    .all<{ id: number; word: string; example_sentences: string }>();

  const updates: Array<{ word_id: number; example_sentences: string }> = [];
  for (const row of result.results ?? []) {
    const next = normalizeJpVocabExampleSentencesFormat(row.example_sentences);
    if (!next) continue;
    updates.push({ word_id: Number(row.id), example_sentences: next });
  }
  return applyJpVocabExampleSentenceUpdates(db, updates, {
    dryRun,
    allowOverwrite: true,
  });
}

export async function applyJpVocabExampleSentenceUpdates(
  db: D1Database,
  updates: Array<{ word_id: number; example_sentences: string }>,
  options: { dryRun?: boolean; allowOverwrite?: boolean } = {}
): Promise<JpVocabFillExampleSentencesResult> {
  const dryRun = Boolean(options.dryRun);
  const allowOverwrite = Boolean(options.allowOverwrite);
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

    const changed = allowOverwrite
      ? await updateExampleSentencesOverwrite(db, wordId, exampleSentences, dryRun)
      : await updateExampleSentencesIfEmpty(db, wordId, exampleSentences, dryRun);
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        example_sentences: exampleSentences,
      });
    } else {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: allowOverwrite ? "unchanged" : "already_filled",
      });
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
