/**
 * Worker 词表补全 API 最小间隔限流（D1）。
 * 防 Mac 定时 / --loop 失控空转打爆日配额。
 * 日语·英语 fill-* 共用；超限返回 429 + Retry-After。
 */

import { clientIp } from "@/lib/locale-pref";

/** 所有词表补全接口统一：同一 IP × 同一路径 ≥5s 一次 */
export const VOCAB_FILL_API_MIN_INTERVAL_MS = 5_000;

/** @deprecated 用 VOCAB_FILL_API_MIN_INTERVAL_MS */
export const JP_VOCAB_FILL_MEANING_MIN_INTERVAL_MS = VOCAB_FILL_API_MIN_INTERVAL_MS;

export const JP_VOCAB_FILL_MEANING_ROUTE = "/api/jp-vocab/fill-meaning";

export const VOCAB_FILL_RATE_LIMITED_ROUTES = [
  "/api/jp-vocab/fill-meaning",
  "/api/jp-vocab/fill-reading",
  "/api/jp-vocab/fill-usage",
  "/api/jp-vocab/fill-pos",
  "/api/jp-vocab/fill-example-sentences",
  "/api/en-vocab/fill-meaning",
  "/api/en-vocab/fill-reading",
  "/api/en-vocab/fill-usage",
  "/api/en-vocab/fill-example-sentences",
] as const;

type RateRow = { last_at_ms: number };

let schemaReady = false;
let devEnabled = false;
const devLast = new Map<string, number>();

export function enableWorkerApiRateLimitDevStore() {
  devEnabled = true;
}

function bucketKey(routeKey: string, clientKey: string): string {
  return `${routeKey.trim() || "/"}|${(clientKey || "unknown").slice(0, 128)}`;
}

async function ensureSchema(db: D1Database): Promise<void> {
  if (devEnabled || schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS worker_api_rate_limit (
         bucket_key TEXT PRIMARY KEY,
         last_at_ms INTEGER NOT NULL,
         updated_at TEXT NOT NULL
       )`
    )
    .run();
  schemaReady = true;
}

/**
 * 同一 route+客户端 未满 minIntervalMs 则拒绝。
 * 成功时写入本次时间戳。
 */
export async function enforceWorkerApiMinInterval(
  db: D1Database,
  opts: {
    routeKey: string;
    clientKey: string;
    minIntervalMs: number;
  }
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const minMs = Math.max(1000, Math.floor(opts.minIntervalMs));
  const key = bucketKey(opts.routeKey, opts.clientKey);
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();

  if (devEnabled) {
    const last = devLast.get(key) ?? 0;
    const elapsed = now - last;
    if (last > 0 && elapsed < minMs) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((minMs - elapsed) / 1000)),
      };
    }
    devLast.set(key, now);
    return { ok: true };
  }

  await ensureSchema(db);

  const existing = await db
    .prepare(
      `SELECT last_at_ms FROM worker_api_rate_limit WHERE bucket_key = ?1`
    )
    .bind(key)
    .first<RateRow>();

  if (existing) {
    const last = Number(existing.last_at_ms) || 0;
    const elapsed = now - last;
    if (elapsed < minMs) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((minMs - elapsed) / 1000)),
      };
    }
    await db
      .prepare(
        `UPDATE worker_api_rate_limit
         SET last_at_ms = ?1, updated_at = ?2
         WHERE bucket_key = ?3`
      )
      .bind(now, updatedAt, key)
      .run();
    return { ok: true };
  }

  try {
    await db
      .prepare(
        `INSERT INTO worker_api_rate_limit (bucket_key, last_at_ms, updated_at)
         VALUES (?1, ?2, ?3)`
      )
      .bind(key, now, updatedAt)
      .run();
  } catch {
    const again = await db
      .prepare(
        `SELECT last_at_ms FROM worker_api_rate_limit WHERE bucket_key = ?1`
      )
      .bind(key)
      .first<RateRow>();
    const last = Number(again?.last_at_ms) || 0;
    const elapsed = now - last;
    if (elapsed < minMs) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((minMs - elapsed) / 1000)),
      };
    }
    await db
      .prepare(
        `UPDATE worker_api_rate_limit
         SET last_at_ms = ?1, updated_at = ?2
         WHERE bucket_key = ?3`
      )
      .bind(now, updatedAt, key)
      .run();
  }
  return { ok: true };
}

/** 词表补全路由入口：超限返回 429 Response，通过返回 null */
export async function enforceVocabFillRouteRateLimit(
  db: D1Database,
  request: Request,
  routeKey: string
): Promise<Response | null> {
  const rate = await enforceWorkerApiMinInterval(db, {
    routeKey,
    clientKey: clientIp(request) || "unknown",
    minIntervalMs: VOCAB_FILL_API_MIN_INTERVAL_MS,
  });
  if (rate.ok) return null;
  return new Response(
    JSON.stringify({
      ok: false,
      error: "rate_limited",
      retry_after_sec: rate.retryAfterSec,
      min_interval_ms: VOCAB_FILL_API_MIN_INTERVAL_MS,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(rate.retryAfterSec),
      },
    }
  );
}
