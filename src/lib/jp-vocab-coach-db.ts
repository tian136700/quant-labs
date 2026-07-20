import {
  JP_VOCAB_COACH_RETENTION_DAYS,
  buildJpVocabCoachExportItems,
  jpVocabCoachRetentionCutoffDate,
  weakerJpVocabCoachLevel,
} from "@/lib/jp-vocab-coach";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

export type JpVocabCoachQueueSummary = {
  total: number;
  pending_count: number;
  done_count: number;
};

export type JpVocabCoachItemRow = {
  word_id: number;
  level: JpVocabLevel;
  display_order: number;
  coached_at: string | null;
  added_at: string;
  updated_at: string;
};

export type JpVocabCoachItem = JpVocabCoachItemRow & {
  word: JpVocabWord;
};

type LegacyCoachItemRow = {
  coach_date: string;
  word_id: number;
  level: string;
  display_order: number;
};

let coachSchemaReady = false;

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeCoachLevel(raw: string | null | undefined): JpVocabLevel | null {
  if (raw === "normal" || raw === "weak" || raw === "very") return raw;
  return null;
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1`)
    .bind(name)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

async function queueHasWordIdPrimaryKey(db: D1Database): Promise<boolean> {
  if (!(await tableExists(db, "jp_vocab_coach_item"))) return false;
  const { results } = await db
    .prepare(`PRAGMA table_info(jp_vocab_coach_item)`)
    .all<{ name: string; pk: number }>();
  const cols = results ?? [];
  const hasCoachedAt = cols.some((c) => c.name === "coached_at");
  const wordIdPk = cols.some((c) => c.name === "word_id" && Number(c.pk) === 1);
  const coachDatePk = cols.some((c) => c.name === "coach_date" && Number(c.pk) > 0);
  return hasCoachedAt && wordIdPk && !coachDatePk;
}

async function migrateLegacyCoachItemsToQueue(db: D1Database): Promise<void> {
  if (await queueHasWordIdPrimaryKey(db)) return;

  const ts = nowIso();
  const hasLegacyItem = await tableExists(db, "jp_vocab_coach_item");
  const hasLegacyBatch = await tableExists(db, "jp_vocab_coach_batch");

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_vocab_coach_queue (
        word_id INTEGER PRIMARY KEY,
        level TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        coached_at TEXT,
        added_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (word_id) REFERENCES jp_vocab_word(id) ON DELETE CASCADE
      )`
    )
    .run();

  if (hasLegacyItem) {
    // 旧表可能是按日复合主键；先尝试读出再折叠
    try {
      const { results } = await db
        .prepare(
          `SELECT coach_date, word_id, level, display_order
           FROM jp_vocab_coach_item
           ORDER BY coach_date ASC, display_order ASC, word_id ASC`
        )
        .all<LegacyCoachItemRow>();

      const byWord = new Map<number, { level: JpVocabLevel; display_order: number }>();
      for (const row of results ?? []) {
        const level = normalizeCoachLevel(row.level);
        if (!level) continue;
        const word_id = Math.floor(Number(row.word_id));
        if (!Number.isFinite(word_id) || word_id <= 0) continue;
        const prev = byWord.get(word_id);
        if (!prev) {
          byWord.set(word_id, {
            level,
            display_order: Number(row.display_order) || byWord.size + 1,
          });
        } else {
          byWord.set(word_id, {
            level: weakerJpVocabCoachLevel(prev.level, level),
            display_order: prev.display_order,
          });
        }
      }

      const statements = [...byWord.entries()].map(([word_id, item], index) =>
        db
          .prepare(
            `INSERT INTO jp_vocab_coach_queue
               (word_id, level, display_order, coached_at, added_at, updated_at)
             VALUES (?1, ?2, ?3, NULL, ?4, ?5)
             ON CONFLICT(word_id) DO UPDATE SET
               level = CASE
                 WHEN jp_vocab_coach_queue.level = 'weak' OR excluded.level = 'weak'
                   THEN 'weak'
                 ELSE excluded.level
               END,
               updated_at = excluded.updated_at`
          )
          .bind(word_id, item.level, item.display_order || index + 1, ts, ts)
      );
      if (statements.length) await db.batch(statements);
    } catch {
      // 若旧表结构已不可读，跳过迁移数据
    }

    await db.prepare(`DROP TABLE IF EXISTS jp_vocab_coach_item`).run();
  }

  if (hasLegacyBatch) {
    await db.prepare(`DROP TABLE IF EXISTS jp_vocab_coach_batch`).run();
  }

  if (await tableExists(db, "jp_vocab_coach_item")) {
    await db.prepare(`DROP TABLE IF EXISTS jp_vocab_coach_item`).run();
  }

  await db
    .prepare(`ALTER TABLE jp_vocab_coach_queue RENAME TO jp_vocab_coach_item`)
    .run();
}

export async function ensureJpVocabCoachSchema(db: D1Database): Promise<void> {
  if (coachSchemaReady) return;

  if (await queueHasWordIdPrimaryKey(db)) {
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_jp_vocab_coach_item_order
         ON jp_vocab_coach_item (display_order, word_id)`
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_jp_vocab_coach_item_coached
         ON jp_vocab_coach_item (coached_at)`
      )
      .run();
    coachSchemaReady = true;
    return;
  }

  await migrateLegacyCoachItemsToQueue(db);

  if (!(await queueHasWordIdPrimaryKey(db))) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS jp_vocab_coach_item (
          word_id INTEGER PRIMARY KEY,
          level TEXT NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          coached_at TEXT,
          added_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (word_id) REFERENCES jp_vocab_word(id) ON DELETE CASCADE
        )`
      )
      .run();
  }

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_jp_vocab_coach_item_order
       ON jp_vocab_coach_item (display_order, word_id)`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_jp_vocab_coach_item_coached
       ON jp_vocab_coach_item (coached_at)`
    )
    .run();

  coachSchemaReady = true;
}

/** 统计应被跨日清理的已带读条数（未带读不过期） */
export async function countJpVocabCoachCoachedOlderThanRetention(
  db: D1Database,
  now = new Date()
): Promise<number> {
  await ensureJpVocabCoachSchema(db);
  const cutoff = jpVocabCoachRetentionCutoffDate(now);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM jp_vocab_coach_item
       WHERE coached_at IS NOT NULL
         AND substr(coached_at, 1, 10) < ?1`
    )
    .bind(cutoff)
    .first<{ c: number }>();
  return Number(row?.c) || 0;
}

/** 删除早于保留截止日的已带读；未带读不过期。默认保留当日已带读。 */
export async function pruneJpVocabCoachCoachedOlderThanRetention(
  db: D1Database,
  now = new Date()
): Promise<number> {
  await ensureJpVocabCoachSchema(db);
  const cutoff = jpVocabCoachRetentionCutoffDate(now);
  const result = await db
    .prepare(
      `DELETE FROM jp_vocab_coach_item
       WHERE coached_at IS NOT NULL
         AND substr(coached_at, 1, 10) < ?1`
    )
    .bind(cutoff)
    .run();
  return Number(result.meta?.changes) || 0;
}

/** 立即清空全部已带读（未带读保留）；用于一次性清理或运维 */
export async function clearAllJpVocabCoachCoached(
  db: D1Database
): Promise<number> {
  await ensureJpVocabCoachSchema(db);
  const result = await db
    .prepare(`DELETE FROM jp_vocab_coach_item WHERE coached_at IS NOT NULL`)
    .run();
  return Number(result.meta?.changes) || 0;
}

/** @deprecated 兼容旧调用名 */
export async function pruneJpVocabCoachBatchesOlderThanRetention(
  db: D1Database,
  now = new Date()
): Promise<number> {
  return pruneJpVocabCoachCoachedOlderThanRetention(db, now);
}

export async function getJpVocabCoachQueueSummary(
  db: D1Database
): Promise<JpVocabCoachQueueSummary> {
  await ensureJpVocabCoachSchema(db);
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN coached_at IS NULL THEN 1 ELSE 0 END) AS pending_count,
         SUM(CASE WHEN coached_at IS NOT NULL THEN 1 ELSE 0 END) AS done_count
       FROM jp_vocab_coach_item`
    )
    .first<{ total: number; pending_count: number; done_count: number }>();

  return {
    total: Number(row?.total) || 0,
    pending_count: Number(row?.pending_count) || 0,
    done_count: Number(row?.done_count) || 0,
  };
}

function normalizeIncomingItems(
  items: Array<{ word_id: number; level: JpVocabLevel; display_order?: number }>
): Array<{ word_id: number; level: JpVocabLevel }> {
  const byWord = new Map<number, JpVocabLevel>();
  for (const item of items) {
    const word_id = Math.floor(Number(item.word_id));
    const level = normalizeCoachLevel(item.level);
    if (!Number.isFinite(word_id) || word_id <= 0 || !level) continue;
    const prev = byWord.get(word_id);
    byWord.set(word_id, prev ? weakerJpVocabCoachLevel(prev, level) : level);
  }
  return [...byWord.entries()].map(([word_id, level]) => ({ word_id, level }));
}

/**
 * 合并带读队列：
 * 1. 剔除库中已带读的 word_id
 * 2. 与未带读去重合并（取较弱熟悉程度）
 * 3. 纯新词追加为未带读
 * 绝不把已带读重置为未带读
 */
export async function mergeJpVocabCoachQueue(
  db: D1Database,
  items: Array<{ word_id: number; level: JpVocabLevel; display_order?: number }>,
  _createdBy: string | null = null
): Promise<JpVocabCoachQueueSummary & { added_count: number; merged_count: number }> {
  await ensureJpVocabCoachSchema(db);
  await pruneJpVocabCoachCoachedOlderThanRetention(db);

  const incomingRaw = normalizeIncomingItems(items);
  if (!incomingRaw.length) {
    const summary = await getJpVocabCoachQueueSummary(db);
    return { ...summary, added_count: 0, merged_count: 0 };
  }

  // 老师端缓存可能仍挂着已删词 id；写入前过滤，避免 FOREIGN KEY constraint failed
  const incomingIds = incomingRaw.map((item) => item.word_id);
  const idPlaceholders = incomingIds.map((_, i) => `?${i + 1}`).join(", ");
  const { results: existingWordRows } = await db
    .prepare(
      `SELECT id FROM jp_vocab_word WHERE id IN (${idPlaceholders})`
    )
    .bind(...incomingIds)
    .all<{ id: number }>();
  const existingWordIds = new Set(
    (existingWordRows ?? []).map((row) => Number(row.id))
  );
  const incoming = incomingRaw.filter((item) => existingWordIds.has(item.word_id));
  if (!incoming.length) {
    const summary = await getJpVocabCoachQueueSummary(db);
    return { ...summary, added_count: 0, merged_count: 0 };
  }

  const { results: existingRows } = await db
    .prepare(
      `SELECT word_id, level, display_order, coached_at, added_at, updated_at
       FROM jp_vocab_coach_item`
    )
    .all<JpVocabCoachItemRow>();

  const existing = new Map<number, JpVocabCoachItemRow>();
  let maxOrder = 0;
  for (const row of existingRows ?? []) {
    const word_id = Math.floor(Number(row.word_id));
    const level = normalizeCoachLevel(row.level);
    if (!level || !Number.isFinite(word_id)) continue;
    existing.set(word_id, {
      word_id,
      level,
      display_order: Number(row.display_order) || 0,
      coached_at: row.coached_at || null,
      added_at: row.added_at,
      updated_at: row.updated_at,
    });
    if (Number(row.display_order) > maxOrder) maxOrder = Number(row.display_order);
  }

  const ts = nowIso();
  const statements: D1PreparedStatement[] = [];
  let added_count = 0;
  let merged_count = 0;

  for (const item of incoming) {
    const prev = existing.get(item.word_id);
    if (prev?.coached_at) {
      // 已带读：跳过，不拉回
      continue;
    }
    if (prev) {
      const nextLevel = weakerJpVocabCoachLevel(prev.level, item.level);
      if (nextLevel !== prev.level) {
        statements.push(
          db
            .prepare(
              `UPDATE jp_vocab_coach_item
               SET level = ?2, updated_at = ?3
               WHERE word_id = ?1 AND coached_at IS NULL`
            )
            .bind(item.word_id, nextLevel, ts)
        );
        merged_count += 1;
      }
      continue;
    }

    maxOrder += 1;
    statements.push(
      db
        .prepare(
          `INSERT INTO jp_vocab_coach_item
             (word_id, level, display_order, coached_at, added_at, updated_at)
           VALUES (?1, ?2, ?3, NULL, ?4, ?5)`
        )
        .bind(item.word_id, item.level, maxOrder, ts, ts)
    );
    added_count += 1;
  }

  if (statements.length) {
    await db.batch(statements);
  }

  const summary = await getJpVocabCoachQueueSummary(db);
  return { ...summary, added_count, merged_count };
}

/**
 * 打开带读页时：把今日抽问勾选为「一般 / 不熟悉」的词自动并入队列。
 * 已带读不拉回；未带读去重合并。
 */
export async function syncJpVocabCoachQueueFromTodayWeak(
  db: D1Database,
  words: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder
): Promise<JpVocabCoachQueueSummary & { added_count: number; merged_count: number }> {
  const items = buildJpVocabCoachExportItems(words, {}, displayOrder);
  if (!items.length) {
    await pruneJpVocabCoachCoachedOlderThanRetention(db);
    const summary = await getJpVocabCoachQueueSummary(db);
    return { ...summary, added_count: 0, merged_count: 0 };
  }
  return mergeJpVocabCoachQueue(db, items);
}

/** 带读页修改熟悉程度（仅未带读条目） */
export async function updateJpVocabCoachItemLevel(
  db: D1Database,
  wordId: number,
  level: JpVocabLevel
): Promise<{ updated: boolean }> {
  await ensureJpVocabCoachSchema(db);
  const normalized = normalizeCoachLevel(level);
  if (!normalized) return { updated: false };

  const id = Math.floor(Number(wordId));
  if (!Number.isFinite(id) || id <= 0) return { updated: false };

  const ts = nowIso();
  const result = await db
    .prepare(
      `UPDATE jp_vocab_coach_item
       SET level = ?2, updated_at = ?3
       WHERE word_id = ?1 AND coached_at IS NULL`
    )
    .bind(id, normalized, ts)
    .run();

  return { updated: (Number(result.meta?.changes) || 0) > 0 };
}

export async function markJpVocabCoachCoached(
  db: D1Database,
  wordIds: number[]
): Promise<{ marked_count: number }> {
  await ensureJpVocabCoachSchema(db);
  const ids = [
    ...new Set(
      wordIds
        .map((id) => Math.floor(Number(id)))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
  if (!ids.length) return { marked_count: 0 };

  const ts = nowIso();
  const statements = ids.map((word_id) =>
    db
      .prepare(
        `UPDATE jp_vocab_coach_item
         SET coached_at = COALESCE(coached_at, ?2), updated_at = ?2
         WHERE word_id = ?1`
      )
      .bind(word_id, ts)
  );
  await db.batch(statements);
  await pruneJpVocabCoachCoachedOlderThanRetention(db);
  return { marked_count: ids.length };
}

export async function listJpVocabCoachQueue(
  db: D1Database,
  wordsById: Map<number, JpVocabWord>
): Promise<{ items: JpVocabCoachItem[]; summary: JpVocabCoachQueueSummary }> {
  await ensureJpVocabCoachSchema(db);
  await pruneJpVocabCoachCoachedOlderThanRetention(db);

  const { results } = await db
    .prepare(
      `SELECT word_id, level, display_order, coached_at, added_at, updated_at
       FROM jp_vocab_coach_item
       ORDER BY display_order ASC, word_id ASC`
    )
    .all<JpVocabCoachItemRow>();

  const items: JpVocabCoachItem[] = [];
  for (const row of results ?? []) {
    const word = wordsById.get(row.word_id);
    if (!word) continue;
    const level = normalizeCoachLevel(row.level);
    if (!level) continue;
    items.push({
      word_id: row.word_id,
      level,
      display_order: Number(row.display_order) || 0,
      coached_at: row.coached_at || null,
      added_at: row.added_at,
      updated_at: row.updated_at,
      word,
    });
  }

  const summary: JpVocabCoachQueueSummary = {
    total: items.length,
    pending_count: items.filter((i) => !i.coached_at).length,
    done_count: items.filter((i) => Boolean(i.coached_at)).length,
  };

  return { items, summary };
}

/** 兼容旧 API：按日覆盖已废弃，改为 merge */
export async function replaceJpVocabCoachBatch(
  db: D1Database,
  _coachDateInput: string,
  items: Array<{ word_id: number; level: JpVocabLevel; display_order: number }>,
  createdBy: string | null
): Promise<{ item_count: number; pending_count: number; done_count: number; total: number }> {
  const result = await mergeJpVocabCoachQueue(db, items, createdBy);
  return {
    item_count: result.total,
    pending_count: result.pending_count,
    done_count: result.done_count,
    total: result.total,
  };
}

export async function getJpVocabCoachItems(
  db: D1Database,
  _coachDateInput: string,
  wordsById: Map<number, JpVocabWord>
): Promise<{ items: JpVocabCoachItem[] }> {
  const { items } = await listJpVocabCoachQueue(db, wordsById);
  return { items };
}

export { JP_VOCAB_COACH_RETENTION_DAYS };
