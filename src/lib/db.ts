import type { BarRow } from "./types";
import { fetchYahooDailyBars } from "./yahoo";

/**
 * D1 读写：按需抓取 + 缓存
 * - 命中：区间内有足够行数则直接 SELECT（毫秒级）
 * - 未命中：Yahoo 抓取后批量 UPSERT（尽量用单条 SQL 减少 CPU）
 */

export async function getBarsWithCache(
  db: D1Database,
  symbol: string,
  warmStart: string,
  endDate: string
): Promise<{ rows: BarRow[]; cacheHit: boolean }> {
  const sym = symbol.trim().toUpperCase();
  const cached = await loadBarsFromD1(db, sym, warmStart, endDate);

  const expectedMin = Math.floor((daysBetween(warmStart, endDate) * 5) / 7);
  if (cached.length >= expectedMin * 0.85) {
    return { rows: cached, cacheHit: true };
  }

  const fetched = await fetchYahooDailyBars(sym, warmStart, endDate);
  if (!fetched.length) {
    return { rows: cached, cacheHit: cached.length > 0 };
  }

  await upsertBarsBatch(db, sym, fetched);
  try {
    await db
      .prepare(
        `INSERT INTO fetch_log (symbol, start_date, end_date, row_count, source, created_at)
         VALUES (?1, ?2, ?3, ?4, 'yahoo', ?5)`
      )
      .bind(sym, warmStart, endDate, fetched.length, new Date().toISOString())
      .run();
  } catch {
    /* fetch_log 表未迁移时忽略 */
  }

  const rows = await loadBarsFromD1(db, sym, warmStart, endDate);
  return { rows: rows.length ? rows : fetched, cacheHit: false };
}

async function loadBarsFromD1(
  db: D1Database,
  symbol: string,
  startDate: string,
  endDate: string
): Promise<BarRow[]> {
  const { results } = await db
    .prepare(
      `SELECT bar_date, open, high, low, close, volume
       FROM daily_bars
       WHERE symbol = ?1 AND bar_date >= ?2 AND bar_date <= ?3
       ORDER BY bar_date ASC`
    )
    .bind(symbol, startDate, endDate)
    .all<BarRow>();

  return results ?? [];
}

/** 分批 UPSERT，每批 100 行，避免单语句过长 */
async function upsertBarsBatch(
  db: D1Database,
  symbol: string,
  rows: BarRow[]
): Promise<void> {
  const now = new Date().toISOString();
  const batchSize = 100;

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const statements = chunk.map((r) =>
      db
        .prepare(
          `INSERT INTO daily_bars (symbol, bar_date, open, high, low, close, volume, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
           ON CONFLICT(symbol, bar_date) DO UPDATE SET
             open = excluded.open,
             high = excluded.high,
             low = excluded.low,
             close = excluded.close,
             volume = excluded.volume,
             updated_at = excluded.updated_at`
        )
        .bind(
          symbol,
          r.bar_date,
          r.open,
          r.high,
          r.low,
          r.close,
          r.volume,
          now
        )
    );
    await db.batch(statements);
  }
}

function daysBetween(a: string, b: string): number {
  const ms =
    new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

export async function getLatestBarDate(
  db: D1Database,
  symbol: string
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT bar_date FROM daily_bars WHERE symbol = ?1 ORDER BY bar_date DESC LIMIT 1`
    )
    .bind(symbol.trim().toUpperCase())
    .first<{ bar_date: string }>();
  return row?.bar_date ?? null;
}
