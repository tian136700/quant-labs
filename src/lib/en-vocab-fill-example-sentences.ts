import "server-only";

import {
  buildEnVocabExampleSentencesAiPrompt,
  EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  validateEnVocabExampleSentencesAiOutput,
} from "@/lib/en-vocab-example-sentences-ai";
import {
  normalizeEnVocabExampleSentencesFormat,
  normalizeEnVocabExampleSentencesSource,
} from "@/lib/en-vocab-example-sentences";
import { ensureEnVocabWordSchema } from "@/lib/en-vocab-db";

export type EnVocabMissingExampleSentenceRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  pos: string | null;
  prompt: string;
};

export type EnVocabFillExampleSentenceApplied = {
  id: number;
  word: string;
  example_sentences: string;
  example_sentences_source: string | null;
};

export type EnVocabFillExampleSentencesResult = {
  updated: number;
  applied: EnVocabFillExampleSentenceApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: EnVocabMissingExampleSentenceRow[];
  total_missing?: number;
  upload_spec?: typeof EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC;
};

export type ListEnVocabMissingExampleSentencesOptions = {
  limit?: number;
  kind?: "word" | "grammar";
};

export async function countEnVocabWordsMissingExampleSentences(
  db: D1Database,
  options: Pick<ListEnVocabMissingExampleSentencesOptions, "kind"> = {}
): Promise<number> {
  const kind = options.kind;
  const result =
    kind === "word" || kind === "grammar"
      ? await db
          .prepare(
            `SELECT COUNT(*) AS n FROM en_vocab_word
             WHERE (example_sentences IS NULL OR TRIM(example_sentences) = '')
               AND kind = ?1`
          )
          .bind(kind)
          .first<{ n: number }>()
      : await db
          .prepare(
            `SELECT COUNT(*) AS n FROM en_vocab_word
             WHERE example_sentences IS NULL OR TRIM(example_sentences) = ''`
          )
          .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listEnVocabWordsMissingExampleSentences(
  db: D1Database,
  options: ListEnVocabMissingExampleSentencesOptions = {}
): Promise<EnVocabMissingExampleSentenceRow[]> {
  await ensureEnVocabWordSchema(db);
  const kind = options.kind;
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  let sql = `SELECT id, word, kind, reading, meaning, pos FROM en_vocab_word
       WHERE example_sentences IS NULL OR TRIM(example_sentences) = ''`;
  const binds: Array<string | number> = [];
  if (kind === "word" || kind === "grammar") {
    sql += ` AND kind = ?${binds.length + 1}`;
    binds.push(kind);
  }
  sql += ` ORDER BY id`;
  if (limit != null) {
    sql += ` LIMIT ?${binds.length + 1}`;
    binds.push(limit);
  }

  const stmt = db.prepare(sql);
  const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all<{
    id: number;
    word: string;
    kind: string;
    reading: string | null;
    meaning: string | null;
    pos: string | null;
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const rowKind = String(row.kind);
    const reading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const meaning =
      row.meaning != null ? String(row.meaning).trim() || null : null;
    const pos = row.pos != null ? String(row.pos).trim() || null : null;
    return {
      id: Number(row.id),
      word,
      kind: rowKind,
      reading,
      meaning,
      pos,
      prompt: buildEnVocabExampleSentencesAiPrompt({
        word,
        kind: rowKind,
        reading,
        meaning,
        pos,
      }),
    };
  });
}

export async function scanEnVocabWordsMissingExampleSentences(
  db: D1Database,
  options: ListEnVocabMissingExampleSentencesOptions = {}
): Promise<EnVocabFillExampleSentencesResult> {
  const [missing, total_missing] = await Promise.all([
    listEnVocabWordsMissingExampleSentences(db, options),
    countEnVocabWordsMissingExampleSentences(db, options),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    upload_spec: EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  };
}

async function updateExampleSentencesIfEmpty(
  db: D1Database,
  wordId: number,
  exampleSentences: string,
  source: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE en_vocab_word
       SET example_sentences = ?1,
           example_sentences_source = ?2,
           updated_at = datetime('now')
       WHERE id = ?3
         AND (example_sentences IS NULL OR TRIM(example_sentences) = '')`
    )
    .bind(exampleSentences.trim(), source, wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export type EnVocabExampleSentenceUpdateItem = {
  word_id: number;
  example_sentences: string;
  source?: string | null;
};

export async function applyEnVocabExampleSentenceUpdates(
  db: D1Database,
  updates: EnVocabExampleSentenceUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
    defaultSource?: string | null;
  } = {}
): Promise<EnVocabFillExampleSentencesResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const defaultSource = normalizeEnVocabExampleSentencesSource(
    options.defaultSource
  );
  const applied: EnVocabFillExampleSentenceApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let exampleSentences = String(item.example_sentences ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !exampleSentences) continue;

    const source =
      normalizeEnVocabExampleSentencesSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(
        `SELECT id, word, kind, reading, meaning, pos FROM en_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        reading: string | null;
        meaning: string | null;
        pos: string | null;
      }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }

    if (validateFormat) {
      const validated = validateEnVocabExampleSentencesAiOutput(
        exampleSentences,
        {
          word: String(row.word),
          kind: String(row.kind),
          reading: row.reading,
          meaning: row.meaning,
          pos: row.pos,
        }
      );
      if (!validated.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `invalid_format:${validated.reason}`,
        });
        continue;
      }
      exampleSentences = validated.text;
    } else {
      exampleSentences =
        normalizeEnVocabExampleSentencesFormat(exampleSentences) ||
        exampleSentences;
    }

    const changed = await updateExampleSentencesIfEmpty(
      db,
      wordId,
      exampleSentences,
      source,
      dryRun
    );
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        example_sentences: exampleSentences,
        example_sentences_source: source,
      });
    } else {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "already_filled",
      });
    }
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
    upload_spec: EN_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC,
  };
}
