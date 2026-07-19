import "server-only";

import { ensureEnVocabWordSchema } from "@/lib/en-vocab-db";
import {
  buildEnVocabMeaningAiPrompt,
  EN_VOCAB_MEANING_UPLOAD_SPEC,
  normalizeEnVocabMeaningSource,
  normalizeEnVocabMeaningText,
  normalizeEnVocabPos,
  validateEnVocabMeaningAiOutput,
  validateEnVocabPos,
} from "@/lib/en-vocab-meaning-ai";

export type EnVocabMissingMeaningRow = {
  id: number;
  word: string;
  reading: string | null;
  kind: string;
  need_meaning: boolean;
  need_pos: boolean;
  /** 可直接喂给本地/远程模型的完整 prompt */
  prompt: string;
};

export type EnVocabFillMeaningApplied = {
  id: number;
  word: string;
  meaning: string | null;
  pos: string | null;
  meaning_source: string | null;
};

export type EnVocabFillMeaningResult = {
  updated: number;
  applied: EnVocabFillMeaningApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: EnVocabMissingMeaningRow[];
  total_missing?: number;
  upload_spec?: typeof EN_VOCAB_MEANING_UPLOAD_SPEC;
};

export type ListEnVocabMissingMeaningOptions = {
  limit?: number;
};

export async function countEnVocabWordsMissingMeaningOrPos(
  db: D1Database
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM en_vocab_word
       WHERE kind != 'grammar'
         AND (
           meaning IS NULL OR TRIM(meaning) = ''
           OR pos IS NULL OR TRIM(pos) = ''
         )`
    )
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listEnVocabWordsMissingMeaningOrPos(
  db: D1Database,
  options: ListEnVocabMissingMeaningOptions = {}
): Promise<EnVocabMissingMeaningRow[]> {
  await ensureEnVocabWordSchema(db);
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  let sql = `SELECT id, word, reading, meaning, pos, kind FROM en_vocab_word
       WHERE kind != 'grammar'
         AND (
           meaning IS NULL OR TRIM(meaning) = ''
           OR pos IS NULL OR TRIM(pos) = ''
         )
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
    meaning: string | null;
    pos: string | null;
    kind: string;
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const reading =
      row.reading != null ? String(row.reading).trim() || null : null;
    const need_meaning = !(row.meaning != null && String(row.meaning).trim());
    const need_pos = !(row.pos != null && String(row.pos).trim());
    return {
      id: Number(row.id),
      word,
      reading,
      kind: String(row.kind),
      need_meaning,
      need_pos,
      prompt: buildEnVocabMeaningAiPrompt({
        word,
        reading,
        kind: String(row.kind),
        need_meaning,
        need_pos,
      }),
    };
  });
}

export async function scanEnVocabWordsMissingMeaning(
  db: D1Database,
  options: ListEnVocabMissingMeaningOptions = {}
): Promise<EnVocabFillMeaningResult> {
  const [missing, total_missing] = await Promise.all([
    listEnVocabWordsMissingMeaningOrPos(db, options),
    countEnVocabWordsMissingMeaningOrPos(db),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    upload_spec: EN_VOCAB_MEANING_UPLOAD_SPEC,
  };
}

export type EnVocabMeaningUpdateItem = {
  word_id: number;
  meaning?: string | null;
  pos?: string | null;
  source?: string | null;
};

export async function applyEnVocabMeaningUpdates(
  db: D1Database,
  updates: EnVocabMeaningUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
    defaultSource?: string | null;
  } = {}
): Promise<EnVocabFillMeaningResult> {
  await ensureEnVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const defaultSource = normalizeEnVocabMeaningSource(options.defaultSource);
  const applied: EnVocabFillMeaningApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) continue;

    let meaningRaw =
      item.meaning != null ? String(item.meaning).trim() : "";
    let posRaw = item.pos != null ? String(item.pos).trim() : "";
    if (!meaningRaw && !posRaw) continue;

    const source =
      normalizeEnVocabMeaningSource(item.source) ?? defaultSource;

    const row = await db
      .prepare(
        `SELECT id, word, kind, meaning, pos FROM en_vocab_word WHERE id = ?1`
      )
      .bind(wordId)
      .first<{
        id: number;
        word: string;
        kind: string;
        meaning: string | null;
        pos: string | null;
      }>();
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

    const meaningEmpty = !(row.meaning != null && String(row.meaning).trim());
    const posEmpty = !(row.pos != null && String(row.pos).trim());

    let nextMeaning: string | null = null;
    let nextPos: string | null = null;

    if (meaningRaw && meaningEmpty) {
      if (validateFormat) {
        const validated = validateEnVocabMeaningAiOutput(meaningRaw);
        if (!validated.ok) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: `invalid_format:${validated.reason}`,
          });
          continue;
        }
        nextMeaning = validated.text;
      } else {
        nextMeaning = normalizeEnVocabMeaningText(meaningRaw) || meaningRaw;
      }
    } else if (meaningRaw && !meaningEmpty) {
      // 已有释义则忽略本次 meaning，仍可补 pos
      meaningRaw = "";
    }

    if (posRaw && posEmpty) {
      if (validateFormat) {
        const validated = validateEnVocabPos(posRaw);
        if (!validated.ok) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: `invalid_format:${validated.reason}`,
          });
          continue;
        }
        nextPos = validated.text;
      } else {
        nextPos = normalizeEnVocabPos(posRaw);
        if (!nextPos) {
          skipped.push({
            id: wordId,
            word: String(row.word),
            reason: "invalid_format:invalid_pos",
          });
          continue;
        }
      }
    } else if (posRaw && !posEmpty) {
      posRaw = "";
    }

    if (!nextMeaning && !nextPos) {
      skipped.push({
        id: wordId,
        word: String(row.word),
        reason: "already_filled",
      });
      continue;
    }

    if (!dryRun) {
      const result = await db
        .prepare(
          `UPDATE en_vocab_word
           SET meaning = CASE
                 WHEN (meaning IS NULL OR TRIM(meaning) = '') AND ?1 IS NOT NULL THEN ?1
                 ELSE meaning
               END,
               pos = CASE
                 WHEN (pos IS NULL OR TRIM(pos) = '') AND ?2 IS NOT NULL THEN ?2
                 ELSE pos
               END,
               meaning_source = CASE
                 WHEN (meaning IS NULL OR TRIM(meaning) = '') AND ?1 IS NOT NULL THEN ?3
                 WHEN (pos IS NULL OR TRIM(pos) = '') AND ?2 IS NOT NULL
                      AND (meaning_source IS NULL OR TRIM(meaning_source) = '') THEN ?3
                 ELSE meaning_source
               END,
               updated_at = datetime('now')
           WHERE id = ?4
             AND kind != 'grammar'`
        )
        .bind(nextMeaning, nextPos, source, wordId)
        .run();
      if (!(Number(result.meta?.changes ?? 0) > 0)) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: "already_filled",
        });
        continue;
      }
    }

    updated += 1;
    applied.push({
      id: wordId,
      word: String(row.word),
      meaning: nextMeaning,
      pos: nextPos,
      meaning_source: source,
    });
  }

  return {
    updated,
    applied,
    skipped,
    dry_run: dryRun,
    upload_spec: EN_VOCAB_MEANING_UPLOAD_SPEC,
  };
}
