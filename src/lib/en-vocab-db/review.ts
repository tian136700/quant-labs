import "server-only";

import { normalizeEnVocabReviewProgress } from "@/lib/en-vocab-review-session";
import type { EnVocabReviewProgress } from "@/lib/en-vocab-review-session";
import { enVocabDbState } from "./state";
import { nowIso } from "./helpers";

export async function ensureEnVocabReviewDoneSchema(db: D1Database): Promise<void> {
  if (enVocabDbState.devStoreEnabled || enVocabDbState.enVocabReviewDoneSchemaReady) {
    return;
  }
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS en_vocab_review_done (
          word_id INTEGER PRIMARY KEY,
          reviewed_at TEXT NOT NULL,
          FOREIGN KEY (word_id) REFERENCES en_vocab_word (id) ON DELETE CASCADE
        )`
      )
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(message)) {
      throw err;
    }
  }
  enVocabDbState.enVocabReviewDoneSchemaReady = true;
}

export async function getEnVocabReviewProgress(
  db: D1Database
): Promise<EnVocabReviewProgress> {
  if (enVocabDbState.devStoreEnabled) {
    return normalizeEnVocabReviewProgress({
      reviewed_word_ids: [...enVocabDbState.devReviewDoneWordIds],
    });
  }
  await ensureEnVocabReviewDoneSchema(db);
  const rows = await db
    .prepare(`SELECT word_id FROM en_vocab_review_done ORDER BY reviewed_at ASC`)
    .all<{ word_id: number }>();
  const reviewed_word_ids = (rows.results ?? [])
    .map((row) => Number(row.word_id))
    .filter((id) => id > 0);
  return normalizeEnVocabReviewProgress({ reviewed_word_ids });
}

/** 复习卡片点「下一个」：记录当前词已完成复习（去重；不按日清零） */
export async function recordEnVocabReviewDone(
  db: D1Database,
  wordId: number
): Promise<EnVocabReviewProgress> {
  const id = Math.floor(Number(wordId));
  if (!Number.isFinite(id) || id <= 0) {
    return getEnVocabReviewProgress(db);
  }
  const current = await getEnVocabReviewProgress(db);
  if (current.reviewed_word_ids.includes(id)) {
    return current;
  }
  if (enVocabDbState.devStoreEnabled) {
    enVocabDbState.devReviewDoneWordIds.push(id);
    return normalizeEnVocabReviewProgress({
      reviewed_word_ids: enVocabDbState.devReviewDoneWordIds,
    });
  }
  await ensureEnVocabReviewDoneSchema(db);
  await db
    .prepare(
      `INSERT INTO en_vocab_review_done (word_id, reviewed_at)
       VALUES (?1, ?2)
       ON CONFLICT(word_id) DO NOTHING`
    )
    .bind(id, nowIso())
    .run();
  return getEnVocabReviewProgress(db);
}

/** 用户手动清除全部复习进度 */
export async function clearEnVocabReviewDone(
  db: D1Database
): Promise<EnVocabReviewProgress> {
  if (enVocabDbState.devStoreEnabled) {
    enVocabDbState.devReviewDoneWordIds.length = 0;
    return normalizeEnVocabReviewProgress(null);
  }
  await ensureEnVocabReviewDoneSchema(db);
  await db.prepare(`DELETE FROM en_vocab_review_done`).run();
  return normalizeEnVocabReviewProgress(null);
}
