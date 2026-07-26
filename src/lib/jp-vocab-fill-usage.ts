import "server-only";

import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import {
  buildJpVocabUsageAiPrompt,
  JP_VOCAB_USAGE_UPLOAD_SPEC,
  normalizeJpVocabUsageSource,
  normalizeJpVocabUsageText,
  validateJpVocabUsageAiOutput,
} from "@/lib/jp-vocab-usage-ai";

export type JpVocabMissingUsageRow = {
  id: number;
  word: string;
  kind: string;
  reading: string | null;
  meaning: string | null;
  prompt: string;
};

export type JpVocabFillUsageApplied = {
  id: number;
  word: string;
  usage: string;
  usage_source: string | null;
};

export type JpVocabFillUsageResult = {
  updated: number;
  applied: JpVocabFillUsageApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: JpVocabMissingUsageRow[];
  total_missing?: number;
  upload_spec?: typeof JP_VOCAB_USAGE_UPLOAD_SPEC;
  /** clear_grammar_examples 清空条数 */
  cleared?: number;
};

export type ListJpVocabMissingUsageOptions = {
  limit?: number;
};

export async function countJpVocabGrammarMissingUsage(
  db: D1Database
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM jp_vocab_word
       WHERE kind = 'grammar'
         AND (usage IS NULL OR usage = '')`
    )
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listJpVocabGrammarMissingUsage(
  db: D1Database,
  options: ListJpVocabMissingUsageOptions = {}
): Promise<JpVocabMissingUsageRow[]> {
  await ensureJpVocabWordSchema(db);
  const rawLimit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;
  const limit = rawLimit == null ? null : Math.min(rawLimit, 20);

  let sql = `SELECT id, word, kind, reading, meaning FROM jp_vocab_word
       WHERE kind = 'grammar'
         AND (usage IS NULL OR usage = '')
       ORDER BY id`;
  if (limit != null) {
    sql += ` LIMIT ?1`;
  }

  const result = await (
    limit != null ? db.prepare(sql).bind(limit) : db.prepare(sql)
  ).all<{
    id: number;
    word: string;
    kind: string;
    reading: string | null;
    meaning: string | null;
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const reading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const meaning =
      row.meaning != null ? String(row.meaning).trim() || null : null;
    return {
      id: Number(row.id),
      word,
      kind: "grammar",
      reading,
      meaning,
      prompt: buildJpVocabUsageAiPrompt({
        word,
        kind: "grammar",
        reading,
        meaning,
      }),
    };
  });
}

export async function scanJpVocabGrammarMissingUsage(
  db: D1Database,
  options: ListJpVocabMissingUsageOptions = {}
): Promise<JpVocabFillUsageResult> {
  const [missing, total_missing] = await Promise.all([
    listJpVocabGrammarMissingUsage(db, options),
    countJpVocabGrammarMissingUsage(db),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    upload_spec: JP_VOCAB_USAGE_UPLOAD_SPEC,
  };
}

/**
 * 清空全部语法例句（及来源）。单词不动。
 * 用于按用法 1:1 重造前清场。
 */
export async function clearAllJpVocabGrammarExampleSentences(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillUsageResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM jp_vocab_word
       WHERE kind = 'grammar'
         AND (
           (example_sentences IS NOT NULL AND example_sentences != '')
           OR (example_sentences_source IS NOT NULL AND example_sentences_source != '')
         )`
    )
    .first<{ n: number }>();
  const cleared = Number(countRow?.n ?? 0);

  if (!dryRun && cleared > 0) {
    await db
      .prepare(
        `UPDATE jp_vocab_word
         SET example_sentences = NULL,
             example_sentences_source = NULL,
             updated_at = datetime('now')
         WHERE kind = 'grammar'
           AND (
             (example_sentences IS NOT NULL AND example_sentences != '')
             OR (example_sentences_source IS NOT NULL AND example_sentences_source != '')
           )`
      )
      .run();
  }

  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: dryRun,
    cleared,
    upload_spec: JP_VOCAB_USAGE_UPLOAD_SPEC,
  };
}

async function updateUsageIfEmpty(
  db: D1Database,
  wordId: number,
  usage: string,
  source: string | null,
  dryRun: boolean,
  force = false
): Promise<boolean> {
  if (dryRun) return true;
  const result = force
    ? await db
        .prepare(
          `UPDATE jp_vocab_word
           SET usage = ?1,
               usage_source = ?2,
               updated_at = datetime('now')
           WHERE id = ?3 AND kind = 'grammar'`
        )
        .bind(usage.trim(), source, wordId)
        .run()
    : await db
        .prepare(
          `UPDATE jp_vocab_word
           SET usage = ?1,
               usage_source = ?2,
               updated_at = datetime('now')
           WHERE id = ?3
             AND kind = 'grammar'
             AND (usage IS NULL OR usage = '')`
        )
        .bind(usage.trim(), source, wordId)
        .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export type JpVocabUsageUpdateItem = {
  word_id: number;
  usage: string;
  source?: string | null;
};

export async function applyJpVocabUsageUpdates(
  db: D1Database,
  updates: JpVocabUsageUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
    defaultSource?: string | null;
    force?: boolean;
  } = {}
): Promise<JpVocabFillUsageResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const force = Boolean(options.force);
  const defaultSource = normalizeJpVocabUsageSource(options.defaultSource);
  const applied: JpVocabFillUsageApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let usage = String(item.usage ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !usage) continue;

    const source =
      normalizeJpVocabUsageSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(`SELECT id, word, kind FROM jp_vocab_word WHERE id = ?1`)
      .bind(wordId)
      .first<{ id: number; word: string; kind: string }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }
    if (row.kind !== "grammar") {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "not_grammar",
      });
      continue;
    }

    if (validateFormat) {
      const validated = validateJpVocabUsageAiOutput(usage, {
        word: String(row.word),
        kind: "grammar",
      });
      if (!validated.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `invalid_format:${validated.reason}`,
        });
        continue;
      }
      usage = validated.text;
    } else {
      usage = normalizeJpVocabUsageText(usage) || usage;
    }

    const changed = await updateUsageIfEmpty(
      db,
      wordId,
      usage,
      source,
      dryRun,
      force
    );
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        usage,
        usage_source: source,
      });
    } else {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: force ? "unchanged" : "already_filled",
      });
    }
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
    upload_spec: JP_VOCAB_USAGE_UPLOAD_SPEC,
  };
}
