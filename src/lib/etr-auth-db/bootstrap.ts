import "server-only";

import {
  encodePasswordStorage,
  hashPassword,
  resolveAdminBootstrap,
  resolveJpVocabBootstrap,
  resolveJpVocabUser1Bootstrap,
  verifyPassword,
  type AdminBootstrap,
} from "../etr-auth";
import type { CloudflareEnv } from "../types";
import { ensureEtrUsersSchema } from "./schema";
import { etrAuthDbState, nowIso } from "./state";

export async function ensureDefaultAdminUser(env: CloudflareEnv): Promise<void> {
  const bootstrap = resolveAdminBootstrap(env);
  if (!bootstrap) return;

  const db = env.DB;
  const { username, password } = bootstrap;

  if (etrAuthDbState.devAuthEnabled) {
    const exists = etrAuthDbState.devUsers.some(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    if (exists) return;
    const { salt, hash } = await hashPassword(password);
    etrAuthDbState.devUsers.push({
      id: etrAuthDbState.devUserIdSeq++,
      username,
      password_hash: encodePasswordStorage(salt, hash),
      role: "admin",
      disabled: 0,
      last_login_at: null,
      last_login_ip: null,
      created_at: nowIso(),
    });
    return;
  }

  const row = await db
    .prepare(
      `SELECT id FROM etr_users WHERE username = ?1 LIMIT 1`
    )
    .bind(username)
    .first<{ id: number }>();

  if (row?.id) return;

  const { salt, hash } = await hashPassword(password);
  await db
    .prepare(
      `INSERT INTO etr_users (username, password_hash, role, created_at)
       VALUES (?1, ?2, 'admin', ?3)`
    )
    .bind(username, encodePasswordStorage(salt, hash), nowIso())
    .run();
}

export async function ensureJpVocabTeacherUser(env: CloudflareEnv): Promise<void> {
  await ensureJpVocabRoleUser(env, resolveJpVocabBootstrap(env));
}

export async function ensureJpVocabUser1(env: CloudflareEnv): Promise<void> {
  await ensureJpVocabRoleUser(env, resolveJpVocabUser1Bootstrap(env));
}

async function ensureJpVocabRoleUser(
  env: CloudflareEnv,
  bootstrap: AdminBootstrap | null
): Promise<void> {
  if (!bootstrap) return;

  const db = env.DB;
  const { username, password } = bootstrap;

  if (etrAuthDbState.devAuthEnabled) {
    const existing = etrAuthDbState.devUsers.find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    if (existing) {
      if (existing.role !== "jp_vocab") {
        existing.role = "jp_vocab";
      }
      const valid = await verifyPassword(password, existing.password_hash);
      if (!valid) {
        const { salt, hash } = await hashPassword(password);
        existing.password_hash = encodePasswordStorage(salt, hash);
      }
      return;
    }
    const { salt, hash } = await hashPassword(password);
    etrAuthDbState.devUsers.push({
      id: etrAuthDbState.devUserIdSeq++,
      username,
      password_hash: encodePasswordStorage(salt, hash),
      role: "jp_vocab",
      disabled: 0,
      last_login_at: null,
      last_login_ip: null,
      created_at: nowIso(),
    });
    return;
  }

  const row = await db
    .prepare(
      `SELECT id, role FROM etr_users WHERE username = ?1 LIMIT 1`
    )
    .bind(username)
    .first<{ id: number; role: string }>();

  if (row?.id) {
    if (row.role !== "jp_vocab") {
      await db
        .prepare(`UPDATE etr_users SET role = 'jp_vocab' WHERE id = ?1`)
        .bind(row.id)
        .run();
    }
    return;
  }

  const { salt, hash } = await hashPassword(password);
  await db
    .prepare(
      `INSERT INTO etr_users (username, password_hash, role, created_at)
       VALUES (?1, ?2, 'jp_vocab', ?3)`
    )
    .bind(username, encodePasswordStorage(salt, hash), nowIso())
    .run();
}

export async function ensureBootstrapUsers(env: CloudflareEnv): Promise<void> {
  if (etrAuthDbState.bootstrapUsersDone) return;
  if (!etrAuthDbState.devAuthEnabled) {
    await ensureEtrUsersSchema(env.DB);
  }
  await ensureDefaultAdminUser(env);
  await ensureJpVocabTeacherUser(env);
  await ensureJpVocabUser1(env);
  etrAuthDbState.bootstrapUsersDone = true;
}

/** 将环境变量 / Secret 中的 bootstrap 账号写入 D1（仅补建缺失账号，绝不覆盖已有密码） */
export async function syncBootstrapUsersFromEnv(env: CloudflareEnv): Promise<void> {
  await ensureBootstrapUsers(env);
}
