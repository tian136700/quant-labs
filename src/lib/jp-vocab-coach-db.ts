import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  isJpVocabCoachDateWithinRetention,
  jpVocabCoachRetentionCutoffDate,
} from "@/lib/jp-vocab-coach";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

export type JpVocabCoachBatchSummary = {
  coach_date: string;
  item_count: number;
  updated_at: string;
};

export type JpVocabCoachItemRow = {
  coach_date: string;
  word_id: number;
  level: JpVocabLevel;
  display_order: number;
};

export type JpVocabCoachItem = JpVocabCoachItemRow & {
  word: JpVocabWord;
};

let coachSchemaReady = false;

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeCoachDate(raw: string | null | undefined): string {
  const trimmed = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return beijingDateString();
}

function normalizeCoachLevel(raw: string | null | undefined): JpVocabLevel | null {
  if (raw === "normal" || raw === "weak") return raw;
  return null;
}

export async function ensureJpVocabCoachSchema(db: D1Database): Promise<void> {
  if (coachSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_vocab_coach_batch (
        coach_date TEXT NOT NULL PRIMARY KEY,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_vocab_coach_item (
        coach_date TEXT NOT NULL,
        word_id INTEGER NOT NULL,
        level TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (coach_date, word_id),
        FOREIGN KEY (coach_date) REFERENCES jp_vocab_coach_batch(coach_date) ON DELETE CASCADE,
        FOREIGN KEY (word_id) REFERENCES jp_vocab_word(id) ON DELETE CASCADE
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_jp_vocab_coach_item_date_order
       ON jp_vocab_coach_item (coach_date, display_order)`
    )
    .run();
  coachSchemaReady = true;
}

/** 删除超过保留期的带读批次（仅 jp_vocab_coach_*；不触及 jp_vocab_word） */
export async function pruneJpVocabCoachBatchesOlderThanRetention(
  db: D1Database,
  now = new Date()
): Promise<number> {
  await ensureJpVocabCoachSchema(db);
  const cutoff = jpVocabCoachRetentionCutoffDate(now);
  const result = await db
    .prepare(`DELETE FROM jp_vocab_coach_batch WHERE coach_date < ?1`)
    .bind(cutoff)
    .run();
  return Number(result.meta?.changes) || 0;
}

export async function listJpVocabCoachBatchSummaries(
  db: D1Database,
  now = new Date()
): Promise<JpVocabCoachBatchSummary[]> {
  await ensureJpVocabCoachSchema(db);
  const cutoff = jpVocabCoachRetentionCutoffDate(now);
  const { results } = await db
    .prepare(
      `SELECT b.coach_date, b.updated_at, COUNT(i.word_id) AS item_count
       FROM jp_vocab_coach_batch b
       LEFT JOIN jp_vocab_coach_item i ON i.coach_date = b.coach_date
       WHERE b.coach_date >= ?1
       GROUP BY b.coach_date
       ORDER BY b.coach_date DESC`
    )
    .bind(cutoff)
    .all<{ coach_date: string; updated_at: string; item_count: number }>();

  return (results ?? []).map((row) => ({
    coach_date: row.coach_date,
    updated_at: row.updated_at,
    item_count: Number(row.item_count) || 0,
  }));
}

export async function replaceJpVocabCoachBatch(
  db: D1Database,
  coachDateInput: string,
  items: Array<{ word_id: number; level: JpVocabLevel; display_order: number }>,
  createdBy: string | null
): Promise<{ coach_date: string; item_count: number }> {
  await ensureJpVocabCoachSchema(db);
  const coach_date = normalizeCoachDate(coachDateInput);
  const ts = nowIso();
  const normalized = items
    .map((item, index) => {
      const word_id = Math.floor(Number(item.word_id));
      const level = normalizeCoachLevel(item.level);
      if (!Number.isFinite(word_id) || word_id <= 0 || !level) return null;
      const display_order =
        Number.isFinite(item.display_order) && item.display_order > 0
          ? Math.floor(item.display_order)
          : index + 1;
      return { word_id, level, display_order };
    })
    .filter((item): item is { word_id: number; level: JpVocabLevel; display_order: number } =>
      Boolean(item)
    );

  const seen = new Set<number>();
  const deduped = normalized.filter((item) => {
    if (seen.has(item.word_id)) return false;
    seen.add(item.word_id);
    return true;
  });

  const statements = [
    db
      .prepare(
        `INSERT INTO jp_vocab_coach_batch (coach_date, created_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(coach_date) DO UPDATE SET
           updated_at = excluded.updated_at,
           created_by = COALESCE(jp_vocab_coach_batch.created_by, excluded.created_by)`
      )
      .bind(coach_date, createdBy, ts, ts),
    db.prepare(`DELETE FROM jp_vocab_coach_item WHERE coach_date = ?1`).bind(coach_date),
    ...deduped.map((item) =>
      db
        .prepare(
          `INSERT INTO jp_vocab_coach_item (coach_date, word_id, level, display_order)
           VALUES (?1, ?2, ?3, ?4)`
        )
        .bind(coach_date, item.word_id, item.level, item.display_order)
    ),
  ];

  await db.batch(statements);
  await pruneJpVocabCoachBatchesOlderThanRetention(db);

  return { coach_date, item_count: deduped.length };
}

export async function getJpVocabCoachItems(
  db: D1Database,
  coachDateInput: string,
  wordsById: Map<number, JpVocabWord>,
  now = new Date()
): Promise<{ coach_date: string; items: JpVocabCoachItem[] }> {
  await ensureJpVocabCoachSchema(db);
  const coach_date = normalizeCoachDate(coachDateInput);
  if (!isJpVocabCoachDateWithinRetention(coach_date, now)) {
    return { coach_date, items: [] };
  }
  const { results } = await db
    .prepare(
      `SELECT coach_date, word_id, level, display_order
       FROM jp_vocab_coach_item
       WHERE coach_date = ?1
       ORDER BY display_order ASC, word_id ASC`
    )
    .bind(coach_date)
    .all<JpVocabCoachItemRow>();

  const items: JpVocabCoachItem[] = [];
  for (const row of results ?? []) {
    const word = wordsById.get(row.word_id);
    if (!word) continue;
    const level = normalizeCoachLevel(row.level);
    if (!level) continue;
    items.push({
      coach_date: row.coach_date,
      word_id: row.word_id,
      level,
      display_order: row.display_order,
      word,
    });
  }

  return { coach_date, items };
}
