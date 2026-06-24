/** 登录失败限速：减缓密码撞库（按 IP，15 分钟内最多 8 次失败） */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

type GuardRow = { fail_count: number; window_start: string };

let devGuardEnabled = false;
const devFailures = new Map<string, GuardRow>();

export function enableEtrLoginGuardDevStore() {
  devGuardEnabled = true;
}

function nowMs(): number {
  return Date.now();
}

function clientKey(request: Request): string {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return ip.slice(0, 128);
}

function windowExpired(windowStart: string): boolean {
  const start = new Date(windowStart).getTime();
  if (!Number.isFinite(start)) return true;
  return nowMs() - start >= WINDOW_MS;
}

function retryAfterSec(windowStart: string): number {
  const start = new Date(windowStart).getTime();
  const end = start + WINDOW_MS;
  return Math.max(1, Math.ceil((end - nowMs()) / 1000));
}

function checkRow(row: GuardRow | null): { ok: true } | { ok: false; retryAfterSec: number } {
  if (!row || row.fail_count < MAX_FAILURES) return { ok: true };
  if (windowExpired(row.window_start)) return { ok: true };
  return { ok: false, retryAfterSec: retryAfterSec(row.window_start) };
}

function readDevRow(key: string): GuardRow | null {
  const row = devFailures.get(key) ?? null;
  if (row && windowExpired(row.window_start)) {
    devFailures.delete(key);
    return null;
  }
  return row;
}

function writeDevFailure(key: string): void {
  const ts = new Date(nowMs()).toISOString();
  const existing = readDevRow(key);
  if (!existing) {
    devFailures.set(key, { fail_count: 1, window_start: ts });
    return;
  }
  devFailures.set(key, {
    fail_count: existing.fail_count + 1,
    window_start: existing.window_start,
  });
}

export async function checkLoginRateLimit(
  db: D1Database,
  request: Request
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const key = clientKey(request);

  if (devGuardEnabled) {
    return checkRow(readDevRow(key));
  }

  const row = await db
    .prepare(
      `SELECT fail_count, window_start FROM etr_login_guard WHERE client_key = ?1 LIMIT 1`
    )
    .bind(key)
    .first<GuardRow>();

  if (row && windowExpired(row.window_start)) {
    await db
      .prepare(`DELETE FROM etr_login_guard WHERE client_key = ?1`)
      .bind(key)
      .run();
    return { ok: true };
  }

  return checkRow(row ?? null);
}

export async function recordLoginFailure(
  db: D1Database,
  request: Request
): Promise<void> {
  const key = clientKey(request);

  if (devGuardEnabled) {
    writeDevFailure(key);
    return;
  }

  const ts = new Date(nowMs()).toISOString();
  const row = await db
    .prepare(
      `SELECT fail_count, window_start FROM etr_login_guard WHERE client_key = ?1 LIMIT 1`
    )
    .bind(key)
    .first<GuardRow>();

  if (!row || windowExpired(row.window_start)) {
    await db
      .prepare(
        `INSERT INTO etr_login_guard (client_key, fail_count, window_start, updated_at)
         VALUES (?1, 1, ?2, ?2)
         ON CONFLICT(client_key) DO UPDATE SET
           fail_count = 1,
           window_start = excluded.window_start,
           updated_at = excluded.updated_at`
      )
      .bind(key, ts)
      .run();
    return;
  }

  await db
    .prepare(
      `UPDATE etr_login_guard
       SET fail_count = fail_count + 1, updated_at = ?1
       WHERE client_key = ?2`
    )
    .bind(ts, key)
    .run();
}

export async function clearLoginFailures(
  db: D1Database,
  request: Request
): Promise<void> {
  const key = clientKey(request);
  devFailures.delete(key);
  await db
    .prepare(`DELETE FROM etr_login_guard WHERE client_key = ?1`)
    .bind(key)
    .run();
}
