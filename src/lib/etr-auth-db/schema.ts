import "server-only";

import { ensureEtrUserLoginHistorySchema } from "./login_history";
import { etrAuthDbState } from "./state";

export async function ensureEtrUsersSchema(db: D1Database): Promise<void> {
  if (etrAuthDbState.devAuthEnabled) return;
  const info = await db.prepare(`PRAGMA table_info(etr_users)`).all<{ name: string }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  const addColumnIfMissing = async (name: string, sqlType: string) => {
    if (cols.has(name)) return;
    try {
      await db.prepare(`ALTER TABLE etr_users ADD COLUMN ${name} ${sqlType}`).run();
      cols.add(name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate column name/i.test(msg)) {
        cols.add(name);
        return;
      }
      throw err;
    }
  };
  await addColumnIfMissing("disabled", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("last_login_at", "TEXT");
  await addColumnIfMissing("last_login_ip", "TEXT");
  await addColumnIfMissing("never_disable", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("allow_multi_device", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("current_session_token", "TEXT");
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_users_last_login_at
       ON etr_users (last_login_at DESC, id DESC)`
    )
    .run();
  await ensureEtrUserLoginHistorySchema(db);
}
