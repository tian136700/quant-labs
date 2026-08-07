import "server-only";

/**
 * 管理员手动「启用」后，压制课表下课禁用 / 抽完延时禁用，
 * 避免定时任务几分钟内又把账号关掉。
 *
 * suppress_after：管理员启用时刻（ISO）。
 * 若 suppress_after >= 本节课的 disableAt（下课+宽限），则跳过自动禁用。
 * 自动启用（05:00 / 开课前）会清掉压制，下一节课结束后仍可正常禁。
 */

const TABLE = "etr_user_schedule_disable_suppress";

let schemaReady = false;

export async function ensureTeacherUserDisableSuppressSchema(
  db: D1Database
): Promise<void> {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
         user_id INTEGER PRIMARY KEY,
         suppress_after TEXT NOT NULL,
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    )
    .run();
  schemaReady = true;
}

/** 管理员手动启用：写入压制时刻 */
export async function markTeacherUserManualEnableSuppress(
  db: D1Database,
  userId: number,
  at = new Date()
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  await ensureTeacherUserDisableSuppressSchema(db);
  const iso = at.toISOString();
  await db
    .prepare(
      `INSERT INTO ${TABLE} (user_id, suppress_after, updated_at)
       VALUES (?1, ?2, ?2)
       ON CONFLICT(user_id) DO UPDATE SET
         suppress_after = excluded.suppress_after,
         updated_at = excluded.updated_at`
    )
    .bind(userId, iso)
    .run();
}

/** 自动启用或管理员手动禁用：清除压制 */
export async function clearTeacherUserDisableSuppress(
  db: D1Database,
  userId: number
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  await ensureTeacherUserDisableSuppressSchema(db);
  await db
    .prepare(`DELETE FROM ${TABLE} WHERE user_id = ?1`)
    .bind(userId)
    .run();
}

export async function clearTeacherUserDisableSuppressMany(
  db: D1Database,
  userIds: number[]
): Promise<void> {
  const ids = [
    ...new Set(
      userIds.filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (!ids.length) return;
  await ensureTeacherUserDisableSuppressSchema(db);
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  await db
    .prepare(`DELETE FROM ${TABLE} WHERE user_id IN (${placeholders})`)
    .bind(...ids)
    .run();
}

/** user_id → suppress_after ISO */
export async function listTeacherUserDisableSuppressAfterByUserId(
  db: D1Database,
  userIds: number[]
): Promise<Map<number, string>> {
  const ids = [
    ...new Set(
      userIds.filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  const out = new Map<number, string>();
  if (!ids.length) return out;
  await ensureTeacherUserDisableSuppressSchema(db);
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(
      `SELECT user_id, suppress_after FROM ${TABLE}
       WHERE user_id IN (${placeholders})`
    )
    .bind(...ids)
    .all<{ user_id: number; suppress_after: string }>();
  for (const row of result.results ?? []) {
    const userId = Number(row.user_id);
    const after = String(row.suppress_after ?? "").trim();
    if (Number.isInteger(userId) && userId > 0 && after) {
      out.set(userId, after);
    }
  }
  return out;
}

/** 管理员启用时刻是否已覆盖本节下课禁用点 */
export function isTeacherUserDisableSuppressedForDisableAt(
  suppressAfterIso: string | null | undefined,
  disableAtMs: number
): boolean {
  if (!suppressAfterIso?.trim()) return false;
  const t = Date.parse(suppressAfterIso.trim());
  if (!Number.isFinite(t)) return false;
  return t >= disableAtMs;
}
