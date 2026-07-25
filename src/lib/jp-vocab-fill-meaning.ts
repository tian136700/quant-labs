import "server-only";

import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import { normalizeJpVocabNaAdjRowsInDb } from "@/lib/jp-vocab-na-adj-db";
import {
  buildJpVocabMeaningAiPrompt,
  JP_VOCAB_MEANING_UPLOAD_SPEC,
  normalizeJpVocabMeaningText,
  validateJpVocabMeaningAiOutput,
} from "@/lib/jp-vocab-meaning-ai";
import { normalizeJpVocabExampleSentencesSource } from "@/lib/jp-vocab-example-sentences";

export type JpVocabMissingMeaningRow = {
  id: number;
  word: string;
  reading: string | null;
  kind: string;
  /** 可直接喂给本地/远程模型的完整 prompt */
  prompt: string;
};

export type JpVocabFillMeaningApplied = {
  id: number;
  word: string;
  meaning: string;
  meaning_source: string | null;
};

export type JpVocabFillMeaningResult = {
  updated: number;
  applied: JpVocabFillMeaningApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: JpVocabMissingMeaningRow[];
  total_missing?: number;
  upload_spec?: typeof JP_VOCAB_MEANING_UPLOAD_SPEC;
  /** clear_all 时清空的单词条数 */
  cleared?: number;
};

export type ListJpVocabMissingMeaningOptions = {
  limit?: number;
};

export async function countJpVocabWordsMissingMeaning(
  db: D1Database
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (meaning IS NULL OR TRIM(meaning) = '')`
    )
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listJpVocabWordsMissingMeaning(
  db: D1Database,
  options: ListJpVocabMissingMeaningOptions = {}
): Promise<JpVocabMissingMeaningRow[]> {
  await ensureJpVocabWordSchema(db);
  // 补全前置：な形容词「〜だ」先剥成词干（与例句 list_missing 一致）
  await normalizeJpVocabNaAdjRowsInDb(db);
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  // 释义不再依赖词性（本机 Ollama 释义已停；tokken 限流可直接补）
  let sql = `SELECT id, word, reading, kind, pos FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (meaning IS NULL OR TRIM(meaning) = '')
       ORDER BY id`;
  if (limit != null) {
    sql += ` LIMIT ?1`;
  }

  const result = await (
    limit != null ? db.prepare(sql).bind(limit) : db.prepare(sql)
  ).all<{
    id: number;
    word: string;
    reading: string | null;
    kind: string;
    pos: string | null;
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const reading = row.reading != null ? String(row.reading).trim() || null : null;
    const pos = row.pos != null ? String(row.pos).trim() || null : null;
    return {
      id: Number(row.id),
      word,
      reading,
      kind: String(row.kind),
      prompt: buildJpVocabMeaningAiPrompt({
        word,
        reading,
        kind: String(row.kind),
        pos,
      }),
    };
  });
}

async function updateMeaningIfEmpty(
  db: D1Database,
  wordId: number,
  meaning: string,
  source: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET meaning = ?1,
           meaning_source = ?2,
           updated_at = datetime('now')
       WHERE id = ?3
         AND kind != 'grammar'
         AND (meaning IS NULL OR TRIM(meaning) = '')`
    )
    .bind(meaning.trim(), source, wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

async function updateMeaningOverwrite(
  db: D1Database,
  wordId: number,
  meaning: string,
  source: string | null,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET meaning = ?1,
           meaning_source = ?2,
           updated_at = datetime('now')
       WHERE id = ?3 AND kind != 'grammar'`
    )
    .bind(meaning.trim(), source, wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function scanJpVocabWordsMissingMeaning(
  db: D1Database,
  options: ListJpVocabMissingMeaningOptions = {}
): Promise<JpVocabFillMeaningResult> {
  const [missing, total_missing] = await Promise.all([
    listJpVocabWordsMissingMeaning(db, options),
    countJpVocabWordsMissingMeaning(db),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    upload_spec: JP_VOCAB_MEANING_UPLOAD_SPEC,
  };
}

/**
 * 清空全部单词释义（grammar 不动）。含「手动」来源。
 * 用于纠错后按常用义重补。
 */
export async function clearAllJpVocabWordMeanings(
  db: D1Database,
  options: { dryRun?: boolean } = {}
): Promise<JpVocabFillMeaningResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (
           (meaning IS NOT NULL AND TRIM(meaning) != '')
           OR (meaning_source IS NOT NULL AND TRIM(meaning_source) != '')
         )`
    )
    .first<{ n: number }>();
  const cleared = Number(countRow?.n ?? 0);

  if (!dryRun && cleared > 0) {
    await db
      .prepare(
        `UPDATE jp_vocab_word
         SET meaning = NULL,
             meaning_source = NULL,
             updated_at = datetime('now')
         WHERE kind != 'grammar'
           AND (
             (meaning IS NOT NULL AND TRIM(meaning) != '')
             OR (meaning_source IS NOT NULL AND TRIM(meaning_source) != '')
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
    upload_spec: JP_VOCAB_MEANING_UPLOAD_SPEC,
  };
}

export type JpVocabMeaningUpdateItem = {
  word_id: number;
  meaning: string;
  source?: string | null;
};

export async function applyJpVocabMeaningUpdates(
  db: D1Database,
  updates: JpVocabMeaningUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
    defaultSource?: string | null;
    allowOverwrite?: boolean;
  } = {}
): Promise<JpVocabFillMeaningResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const allowOverwrite = Boolean(options.allowOverwrite);
  const defaultSource = normalizeJpVocabExampleSentencesSource(
    options.defaultSource
  );
  const applied: JpVocabFillMeaningApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let meaning = String(item.meaning ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !meaning) continue;

    const source =
      normalizeJpVocabExampleSentencesSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(`SELECT id, word, kind FROM jp_vocab_word WHERE id = ?1`)
      .bind(wordId)
      .first<{ id: number; word: string; kind: string }>();
    if (!row) {
      skipped.push({ id: wordId, word: String(wordId), reason: "not_found" });
      continue;
    }
    if (row.kind === "grammar") {
      skipped.push({ id: wordId, word: String(row.word), reason: "grammar_skipped" });
      continue;
    }

    if (validateFormat) {
      const validated = validateJpVocabMeaningAiOutput(meaning);
      if (!validated.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `invalid_format:${validated.reason}`,
        });
        continue;
      }
      meaning = validated.text;
    } else {
      meaning = normalizeJpVocabMeaningText(meaning) || meaning;
    }

    const changed = allowOverwrite
      ? await updateMeaningOverwrite(db, wordId, meaning, source, dryRun)
      : await updateMeaningIfEmpty(db, wordId, meaning, source, dryRun);
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        meaning,
        meaning_source: source,
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
    upload_spec: JP_VOCAB_MEANING_UPLOAD_SPEC,
  };
}
