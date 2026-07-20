import "server-only";

import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db";
import { normalizeJpVocabNaAdjRowsInDb } from "@/lib/jp-vocab-na-adj-db";
import {
  buildJpVocabPosAiPrompt,
  JP_VOCAB_POS_UPLOAD_SPEC,
  normalizeJpVocabPosText,
  validateJpVocabPosAiOutput,
} from "@/lib/jp-vocab-pos-ai";

export type JpVocabMissingPosRow = {
  id: number;
  word: string;
  reading: string | null;
  kind: string;
  /** 可直接喂给本地/远程模型的完整 prompt */
  prompt: string;
};

export type JpVocabFillPosApplied = {
  id: number;
  word: string;
  pos: string;
};

export type JpVocabFillPosResult = {
  updated: number;
  applied: JpVocabFillPosApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
  missing?: JpVocabMissingPosRow[];
  total_missing?: number;
  upload_spec?: typeof JP_VOCAB_POS_UPLOAD_SPEC;
};

export type ListJpVocabMissingPosOptions = {
  limit?: number;
};

export async function countJpVocabWordsMissingPos(db: D1Database): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (pos IS NULL OR TRIM(pos) = '')`
    )
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

export async function listJpVocabWordsMissingPos(
  db: D1Database,
  options: ListJpVocabMissingPosOptions = {}
): Promise<JpVocabMissingPosRow[]> {
  await ensureJpVocabWordSchema(db);
  await normalizeJpVocabNaAdjRowsInDb(db);
  const limit =
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  let sql = `SELECT id, word, reading, kind FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (pos IS NULL OR TRIM(pos) = '')
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
  }>();

  return (result.results ?? []).map((row) => {
    const word = String(row.word);
    const reading = row.reading != null ? String(row.reading).trim() || null : null;
    return {
      id: Number(row.id),
      word,
      reading,
      kind: String(row.kind),
      prompt: buildJpVocabPosAiPrompt({ word, reading, kind: String(row.kind) }),
    };
  });
}

async function updatePosIfEmpty(
  db: D1Database,
  wordId: number,
  pos: string,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;
  const result = await db
    .prepare(
      `UPDATE jp_vocab_word
       SET pos = ?1,
           updated_at = datetime('now')
       WHERE id = ?2
         AND kind != 'grammar'
         AND (pos IS NULL OR TRIM(pos) = '')`
    )
    .bind(pos.trim(), wordId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function scanJpVocabWordsMissingPos(
  db: D1Database,
  options: ListJpVocabMissingPosOptions = {}
): Promise<JpVocabFillPosResult> {
  const [missing, total_missing] = await Promise.all([
    listJpVocabWordsMissingPos(db, options),
    countJpVocabWordsMissingPos(db),
  ]);
  return {
    updated: 0,
    applied: [],
    skipped: [],
    dry_run: true,
    missing,
    total_missing,
    upload_spec: JP_VOCAB_POS_UPLOAD_SPEC,
  };
}

export type JpVocabPosUpdateItem = {
  word_id: number;
  pos: string;
};

export async function applyJpVocabPosUpdates(
  db: D1Database,
  updates: JpVocabPosUpdateItem[],
  options: {
    dryRun?: boolean;
    validateFormat?: boolean;
  } = {}
): Promise<JpVocabFillPosResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const validateFormat = options.validateFormat !== false;
  const applied: JpVocabFillPosApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];
  let updated = 0;

  for (const item of updates) {
    const wordId = Number(item.word_id);
    let pos = String(item.pos ?? "").trim();
    if (!Number.isInteger(wordId) || wordId <= 0 || !pos) continue;

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
      const validated = validateJpVocabPosAiOutput(pos);
      if (!validated.ok) {
        skipped.push({
          id: wordId,
          word: String(row.word),
          reason: `invalid_format:${validated.reason}`,
        });
        continue;
      }
      pos = validated.text;
    } else {
      pos = normalizeJpVocabPosText(pos) || pos;
    }

    const changed = await updatePosIfEmpty(db, wordId, pos, dryRun);
    if (changed) {
      updated += 1;
      applied.push({
        id: wordId,
        word: String(row.word),
        pos,
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
    upload_spec: JP_VOCAB_POS_UPLOAD_SPEC,
  };
}
