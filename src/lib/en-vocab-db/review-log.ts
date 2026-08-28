import "server-only";

import {
  type EnVocabReviewLogEntry,
  type EnVocabReviewLogSource,
} from "@/lib/en-vocab-review-log";
import { listEnVocabUsagePointsForDisplay } from "@/lib/en-vocab-usage-examples-display";
import type { EnVocabLevel } from "@/lib/types";
import { enVocabDbState } from "./state";

export type AppendEnVocabReviewLogInput = {
  wordId: number;
  reviewedAt: string;
  reviewedBy: string;
  overallLevel: EnVocabLevel;
  usageLevels: EnVocabLevel[] | null;
  sharedToStudy: boolean;
  source: EnVocabReviewLogSource;
};

let devReviewLogNextId = 1;

export async function ensureEnVocabReviewLogSchema(
  db: D1Database
): Promise<void> {
  if (enVocabDbState.devStoreEnabled || enVocabDbState.enVocabReviewLogSchemaReady) {
    return;
  }
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS en_vocab_review_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          word_id INTEGER NOT NULL,
          reviewed_at TEXT NOT NULL,
          reviewed_by TEXT NOT NULL,
          overall_level TEXT NOT NULL,
          usage_levels TEXT,
          usage_labels TEXT,
          usage_count INTEGER NOT NULL DEFAULT 0,
          shared_to_study INTEGER NOT NULL DEFAULT 0,
          source TEXT NOT NULL DEFAULT 'flashcard_usage',
          FOREIGN KEY (word_id) REFERENCES en_vocab_word (id) ON DELETE CASCADE
        )`
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_en_vocab_review_log_word
         ON en_vocab_review_log (word_id, reviewed_at DESC, id DESC)`
      )
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(message)) {
      throw err;
    }
  }
  enVocabDbState.enVocabReviewLogSchemaReady = true;
}

async function loadUsageTextForReviewLog(
  db: D1Database,
  wordId: number
): Promise<string | null> {
  if (enVocabDbState.devStoreEnabled) {
    const word = enVocabDbState.devWords.find((w) => w.id === wordId);
    return word?.usage ?? null;
  }
  const row = await db
    .prepare(`SELECT usage FROM en_vocab_word WHERE id = ?1`)
    .bind(wordId)
    .first<{ usage: string | null }>();
  return row?.usage ?? null;
}

function buildUsageLabels(
  usageRaw: string | null,
  usageLevels: EnVocabLevel[] | null
): { labels: string[] | null; count: number } {
  const { points } = listEnVocabUsagePointsForDisplay(usageRaw);
  const count = usageLevels?.length ?? (points.length > 0 ? 0 : 0);
  if (!usageLevels?.length) {
    return { labels: points.length ? points.map((p) => p.text) : null, count: 0 };
  }
  const labels = usageLevels.map((_, i) => points[i]?.text ?? `用法${i + 1}`);
  return { labels, count: usageLevels.length };
}

function mapReviewLogRow(row: Record<string, unknown>): EnVocabReviewLogEntry {
  let usage_levels: EnVocabLevel[] | null = null;
  if (row.usage_levels != null && String(row.usage_levels).trim()) {
    try {
      const parsed = JSON.parse(String(row.usage_levels)) as unknown;
      if (Array.isArray(parsed)) {
        usage_levels = parsed as EnVocabLevel[];
      }
    } catch {
      usage_levels = null;
    }
  }
  let usage_labels: string[] | null = null;
  if (row.usage_labels != null && String(row.usage_labels).trim()) {
    try {
      const parsed = JSON.parse(String(row.usage_labels)) as unknown;
      if (Array.isArray(parsed)) {
        usage_labels = parsed.map((x) => String(x));
      }
    } catch {
      usage_labels = null;
    }
  }
  return {
    id: Number(row.id),
    word_id: Number(row.word_id),
    reviewed_at: String(row.reviewed_at ?? ""),
    reviewed_by: String(row.reviewed_by ?? ""),
    overall_level: String(row.overall_level ?? "weak") as EnVocabLevel,
    usage_levels,
    usage_labels,
    usage_count: Number(row.usage_count ?? 0),
    shared_to_study: Number(row.shared_to_study ?? 0) === 1,
    source: String(row.source ?? "flashcard_usage") as EnVocabReviewLogSource,
  };
}

export async function appendEnVocabReviewLog(
  db: D1Database,
  input: AppendEnVocabReviewLogInput
): Promise<void> {
  const reviewedBy = (input.reviewedBy || "").trim() || "unknown";
  const usageRaw = await loadUsageTextForReviewLog(db, input.wordId);
  const { labels, count } = buildUsageLabels(usageRaw, input.usageLevels);

  if (enVocabDbState.devStoreEnabled) {
    if (!enVocabDbState.devReviewLogs) {
      enVocabDbState.devReviewLogs = [];
    }
    enVocabDbState.devReviewLogs.push({
      id: devReviewLogNextId++,
      word_id: input.wordId,
      reviewed_at: input.reviewedAt,
      reviewed_by: reviewedBy,
      overall_level: input.overallLevel,
      usage_levels: input.usageLevels,
      usage_labels: labels,
      usage_count: count,
      shared_to_study: input.sharedToStudy,
      source: input.source,
    });
    return;
  }

  await ensureEnVocabReviewLogSchema(db);
  await db
    .prepare(
      `INSERT INTO en_vocab_review_log (
         word_id, reviewed_at, reviewed_by, overall_level,
         usage_levels, usage_labels, usage_count, shared_to_study, source
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
    )
    .bind(
      input.wordId,
      input.reviewedAt,
      reviewedBy,
      input.overallLevel,
      input.usageLevels ? JSON.stringify(input.usageLevels) : null,
      labels ? JSON.stringify(labels) : null,
      count,
      input.sharedToStudy ? 1 : 0,
      input.source
    )
    .run();
}

export async function listEnVocabReviewLog(
  db: D1Database,
  wordId: number,
  limit = 50
): Promise<EnVocabReviewLogEntry[]> {
  const id = Math.floor(Number(wordId));
  if (!Number.isFinite(id) || id <= 0) return [];
  const capped = Math.min(Math.max(Math.floor(limit), 1), 100);

  if (enVocabDbState.devStoreEnabled) {
    return (enVocabDbState.devReviewLogs ?? [])
      .filter((row) => row.word_id === id)
      .sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at) || b.id - a.id)
      .slice(0, capped)
      .map((row) => mapReviewLogRow(row as unknown as Record<string, unknown>));
  }

  await ensureEnVocabReviewLogSchema(db);
  const rows = await db
    .prepare(
      `SELECT id, word_id, reviewed_at, reviewed_by, overall_level,
              usage_levels, usage_labels, usage_count, shared_to_study, source
       FROM en_vocab_review_log
       WHERE word_id = ?1
       ORDER BY reviewed_at DESC, id DESC
       LIMIT ?2`
    )
    .bind(id, capped)
    .all<Record<string, unknown>>();

  return (rows.results ?? []).map(mapReviewLogRow);
}
