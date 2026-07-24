import "server-only";

import {
  ETR_DEFAULT_JP_VOCAB_USER1_USERNAME,
  ETR_DEFAULT_JP_VOCAB_USERNAME,
  isReservedUsername,
  isValidUsername,
  normalizeUsername,
  resolveAdminBootstrap,
  resolveJpVocabBootstrap,
  resolveJpVocabUser1Bootstrap,
  type EtrUser,
} from "../etr-auth";
import { teacherNameToUsername } from "../teacher-name-username";
import type { CloudflareEnv } from "../types";
import { ensureBootstrapUsers } from "./bootstrap";
import {
  ensureUserEnabledById,
  findUserById,
  findUserByUsername,
} from "./session";
import {
  createUserByAdmin,
  generateAdminResetPassword,
  generateMemorableTeacherPassword,
} from "./users";
import { etrAuthDbState, nowIso } from "./state";

let userTeacherLinkSchemaEnsured = false;

async function ensureUserTeacherLinkSchema(db: D1Database): Promise<void> {
  if (etrAuthDbState.devAuthEnabled || userTeacherLinkSchemaEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_user_jp_lesson_teacher_link (
         user_id INTEGER PRIMARY KEY,
         teacher_id INTEGER NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE,
         FOREIGN KEY (teacher_id) REFERENCES jp_lesson_teacher(id) ON DELETE CASCADE
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_user_jp_lesson_teacher_link_teacher
       ON etr_user_jp_lesson_teacher_link (teacher_id)`
    )
    .run();
  userTeacherLinkSchemaEnsured = true;
}

async function linkUserToJpLessonTeacher(
  db: D1Database,
  userId: number,
  teacherId: number
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!Number.isInteger(teacherId) || teacherId <= 0) return;
  if (etrAuthDbState.devAuthEnabled) return;
  await ensureUserTeacherLinkSchema(db);
  const ts = nowIso();
  // 一位老师只对应一个登录账号：先清掉该老师的其它关联
  await db
    .prepare(
      `DELETE FROM etr_user_jp_lesson_teacher_link
       WHERE teacher_id = ?1 AND user_id != ?2`
    )
    .bind(teacherId, userId)
    .run();
  await db
    .prepare(
      `INSERT INTO etr_user_jp_lesson_teacher_link (user_id, teacher_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(user_id) DO UPDATE SET teacher_id = excluded.teacher_id, updated_at = excluded.updated_at`
    )
    .bind(userId, teacherId, ts)
    .run();
}

export type JpLessonTeacherLinkByUser = {
  teacher_id: number;
  teacher_name: string;
};

export async function listJpLessonTeacherLinkMapByUserId(
  db: D1Database
): Promise<Map<number, JpLessonTeacherLinkByUser>> {
  if (etrAuthDbState.devAuthEnabled) return new Map();
  await ensureUserTeacherLinkSchema(db);
  const result = await db
    .prepare(
      `SELECT link.user_id AS user_id, link.teacher_id AS teacher_id, teacher.name AS teacher_name
       FROM etr_user_jp_lesson_teacher_link link
       JOIN jp_lesson_teacher teacher ON teacher.id = link.teacher_id`
    )
    .all<{ user_id: number; teacher_id: number; teacher_name: string }>();
  const map = new Map<number, JpLessonTeacherLinkByUser>();
  for (const row of result.results ?? []) {
    const userId = Number(row.user_id);
    const teacherId = Number(row.teacher_id);
    if (!Number.isInteger(userId) || userId <= 0) continue;
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    map.set(userId, {
      teacher_id: teacherId,
      teacher_name: String(row.teacher_name ?? "").trim(),
    });
  }
  return map;
}

export async function listJpLessonTeacherNameMapByUserId(
  db: D1Database
): Promise<Map<number, string>> {
  const linkMap = await listJpLessonTeacherLinkMapByUserId(db);
  const map = new Map<number, string>();
  for (const [userId, link] of linkMap) {
    map.set(userId, link.teacher_name);
  }
  return map;
}

export type SetUserJpLessonTeacherLinkResult =
  | { ok: true; teacher_id: number | null; teacher_name: string | null }
  | { ok: false; error: "user_not_found" | "teacher_not_found" };

/** 设置/清除用户与日语上课老师的关联（一位老师最多对应一个账号）。 */
export async function setUserJpLessonTeacherLink(
  db: D1Database,
  userId: number,
  teacherId: number | null
): Promise<SetUserJpLessonTeacherLinkResult> {
  if (!Number.isInteger(userId) || userId <= 0) {
    return { ok: false, error: "user_not_found" };
  }
  if (etrAuthDbState.devAuthEnabled) {
    return { ok: true, teacher_id: teacherId, teacher_name: null };
  }

  const user = await findUserById(db, userId);
  if (!user) return { ok: false, error: "user_not_found" };

  await ensureUserTeacherLinkSchema(db);

  if (teacherId == null) {
    await db
      .prepare(`DELETE FROM etr_user_jp_lesson_teacher_link WHERE user_id = ?1`)
      .bind(userId)
      .run();
    return { ok: true, teacher_id: null, teacher_name: null };
  }

  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return { ok: false, error: "teacher_not_found" };
  }

  const teacher = await db
    .prepare(`SELECT id, name FROM jp_lesson_teacher WHERE id = ?1 LIMIT 1`)
    .bind(teacherId)
    .first<{ id: number; name: string }>();
  if (!teacher) return { ok: false, error: "teacher_not_found" };

  await linkUserToJpLessonTeacher(db, userId, teacherId);
  return {
    ok: true,
    teacher_id: Number(teacher.id),
    teacher_name: String(teacher.name ?? "").trim() || null,
  };
}

export type JpLessonTeacherUserLink = {
  user_id: number;
  username: string;
};

export async function findJpLessonTeacherUserLink(
  db: D1Database,
  teacherId: number
): Promise<JpLessonTeacherUserLink | null> {
  if (!Number.isInteger(teacherId) || teacherId <= 0) return null;
  if (etrAuthDbState.devAuthEnabled) return null;
  await ensureUserTeacherLinkSchema(db);
  const row = await db
    .prepare(
      `SELECT link.user_id AS user_id, u.username AS username
       FROM etr_user_jp_lesson_teacher_link link
       JOIN etr_users u ON u.id = link.user_id
       WHERE link.teacher_id = ?1
       LIMIT 1`
    )
    .bind(teacherId)
    .first<{ user_id: number; username: string }>();
  if (!row) return null;
  const userId = Number(row.user_id);
  const username = String(row.username ?? "").trim();
  if (!Number.isInteger(userId) || userId <= 0 || !username) return null;
  return { user_id: userId, username };
}

export async function listJpLessonTeacherUserLinkMapByTeacherId(
  db: D1Database
): Promise<Map<number, JpLessonTeacherUserLink>> {
  if (etrAuthDbState.devAuthEnabled) return new Map();
  await ensureUserTeacherLinkSchema(db);
  const result = await db
    .prepare(
      `SELECT link.teacher_id AS teacher_id, link.user_id AS user_id, u.username AS username
       FROM etr_user_jp_lesson_teacher_link link
       JOIN etr_users u ON u.id = link.user_id`
    )
    .all<{ teacher_id: number; user_id: number; username: string }>();
  const map = new Map<number, JpLessonTeacherUserLink>();
  for (const row of result.results ?? []) {
    const teacherId = Number(row.teacher_id);
    const userId = Number(row.user_id);
    const username = String(row.username ?? "").trim();
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    if (!Number.isInteger(userId) || userId <= 0 || !username) continue;
    map.set(teacherId, { user_id: userId, username });
  }
  return map;
}

export type EnsureJpLessonTeacherUserAccountResult =
  | { ok: true; created: boolean; user: EtrUser; password?: string }
  | { ok: false; error: string };

/** 一键为日语上课老师创建/关联 jp_vocab 账号（用户名拼音 + 易记密码） */
export async function ensureJpLessonTeacherUserAccount(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<EnsureJpLessonTeacherUserAccountResult> {
  const existingLink = await findJpLessonTeacherUserLink(env.DB, teacherId);
  if (existingLink) {
    const user = await ensureUserEnabledById(env.DB, existingLink.user_id);
    if (user) return { ok: true, created: false, user };
  }

  const provision = await createJpLessonTeacherUserByReview(
    env,
    teacherId,
    teacherName
  );
  if (provision.ok && provision.created) {
    return {
      ok: true,
      created: true,
      user: provision.user,
      password: provision.password,
    };
  }
  if (!provision.ok) {
    return { ok: false, error: provision.error };
  }

  if (provision.reason === "user_exists") {
    const baseUsername = normalizeUsername(teacherNameToUsername(teacherName));
    if (!baseUsername) return { ok: false, error: "username_invalid" };
    const existing = await findUserByUsername(env.DB, baseUsername);
    if (!existing) return { ok: false, error: "user_exists" };
    if (existing.role !== "jp_vocab") {
      return { ok: false, error: "username_taken" };
    }
    await linkUserToJpLessonTeacher(env.DB, existing.id, teacherId);
    const enabled = await ensureUserEnabledById(env.DB, existing.id);
    if (!enabled) return { ok: false, error: "user_not_found" };
    return { ok: true, created: false, user: enabled };
  }

  return { ok: false, error: provision.reason ?? "username_unavailable" };
}

export type ProvisionJpLessonTeacherUserResult =
  | { ok: true; created: true; user: EtrUser; password: string }
  | { ok: true; created: false; reason: "user_exists" | "username_unavailable" }
  | { ok: false; error: string };

/** 添加日语上课老师时，自动创建禁用的 jp_vocab 账号（用户名取自横杠前的称呼拼音） */
export async function provisionJpLessonTeacherUser(
  env: CloudflareEnv,
  teacherName: string
): Promise<ProvisionJpLessonTeacherUserResult> {
  const baseUsername = teacherNameToUsername(teacherName);
  if (!baseUsername) {
    return { ok: false, error: "username_invalid" };
  }

  await ensureBootstrapUsers(env);

  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  const candidates = [baseUsername];
  for (let i = 2; i <= 99; i += 1) {
    candidates.push(`${baseUsername}${i}`);
  }

  let username: string | null = null;
  for (const candidate of candidates) {
    const name = normalizeUsername(candidate);
    if (!isValidUsername(name)) continue;
    if (isReservedUsername(name, adminName, jpVocabName, jpVocabUser1Name)) {
      continue;
    }
    const existing = await findUserByUsername(env.DB, name);
    if (existing) {
      if (candidate === baseUsername) {
        return { ok: true, created: false, reason: "user_exists" };
      }
      continue;
    }
    username = name;
    break;
  }

  if (!username) {
    return { ok: true, created: false, reason: "username_unavailable" };
  }

  const password = generateAdminResetPassword(10);
  const result = await createUserByAdmin(env, username, password, "jp_vocab", {
    disabled: false,
  });
  if (!result.ok) {
    if (result.error === "username_taken") {
      return { ok: true, created: false, reason: "user_exists" };
    }
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    created: true,
    user: result.user,
    password,
  };
}

export type CreateJpLessonTeacherUserByReviewResult =
  | { ok: true; created: true; user: EtrUser; password: string }
  | { ok: true; created: false; reason: "user_exists" | "username_unavailable" }
  | { ok: false; error: string };

/** 老师打分后按勾选创建日语账号，并写入老师-用户映射 */
export async function createJpLessonTeacherUserByReview(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<CreateJpLessonTeacherUserByReviewResult> {
  let baseUsername: string;
  try {
    baseUsername = teacherNameToUsername(teacherName);
  } catch {
    return { ok: false, error: "username_invalid" };
  }
  if (!baseUsername) return { ok: false, error: "username_invalid" };

  await ensureBootstrapUsers(env);

  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  const candidates = [baseUsername];
  for (let i = 2; i <= 99; i += 1) candidates.push(`${baseUsername}${i}`);

  let chosen: string | null = null;
  for (const candidate of candidates) {
    const username = normalizeUsername(candidate);
    if (!isValidUsername(username)) continue;
    if (isReservedUsername(username, adminName, jpVocabName, jpVocabUser1Name)) continue;
    const existing = await findUserByUsername(env.DB, username);
    if (existing) {
      if (candidate === baseUsername) return { ok: true, created: false, reason: "user_exists" };
      continue;
    }
    chosen = username;
    break;
  }

  if (!chosen) return { ok: true, created: false, reason: "username_unavailable" };

  const password = generateMemorableTeacherPassword(10);
  const created = await createUserByAdmin(env, chosen, password, "jp_vocab");
  if (!created.ok) {
    if (created.error === "username_taken") {
      return { ok: true, created: false, reason: "user_exists" };
    }
    return { ok: false, error: created.error };
  }

  await linkUserToJpLessonTeacher(env.DB, created.user.id, teacherId);
  const enabled = await ensureUserEnabledById(env.DB, created.user.id);
  if (!enabled) return { ok: false, error: "user_not_found" };
  return { ok: true, created: true, user: enabled, password };
}

let userKoTeacherLinkSchemaEnsured = false;

async function ensureUserKoTeacherLinkSchema(db: D1Database): Promise<void> {
  if (etrAuthDbState.devAuthEnabled || userKoTeacherLinkSchemaEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_user_ko_lesson_teacher_link (
         user_id INTEGER PRIMARY KEY,
         teacher_id INTEGER NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now')),
         FOREIGN KEY (user_id) REFERENCES etr_users(id) ON DELETE CASCADE
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_etr_user_ko_lesson_teacher_link_teacher
       ON etr_user_ko_lesson_teacher_link (teacher_id)`
    )
    .run();
  userKoTeacherLinkSchemaEnsured = true;
}

async function linkUserToKoLessonTeacher(
  db: D1Database,
  userId: number,
  teacherId: number
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!Number.isInteger(teacherId) || teacherId <= 0) return;
  if (etrAuthDbState.devAuthEnabled) return;
  await ensureUserKoTeacherLinkSchema(db);
  const ts = nowIso();
  await db
    .prepare(
      `DELETE FROM etr_user_ko_lesson_teacher_link
       WHERE teacher_id = ?1 AND user_id != ?2`
    )
    .bind(teacherId, userId)
    .run();
  await db
    .prepare(
      `INSERT INTO etr_user_ko_lesson_teacher_link (user_id, teacher_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(user_id) DO UPDATE SET teacher_id = excluded.teacher_id, updated_at = excluded.updated_at`
    )
    .bind(userId, teacherId, ts)
    .run();
}

export type KoLessonTeacherUserLink = {
  user_id: number;
  username: string;
  teacher_id: number;
};

export async function findKoLessonTeacherUserLink(
  db: D1Database,
  teacherId: number
): Promise<KoLessonTeacherUserLink | null> {
  if (etrAuthDbState.devAuthEnabled) return null;
  if (!Number.isInteger(teacherId) || teacherId <= 0) return null;
  await ensureUserKoTeacherLinkSchema(db);
  const row = await db
    .prepare(
      `SELECT link.user_id AS user_id, u.username AS username, link.teacher_id AS teacher_id
       FROM etr_user_ko_lesson_teacher_link link
       INNER JOIN etr_users u ON u.id = link.user_id
       WHERE link.teacher_id = ?1`
    )
    .bind(teacherId)
    .first<KoLessonTeacherUserLink>();
  return row ?? null;
}

export async function listKoLessonTeacherUserLinkMapByTeacherId(
  db: D1Database
): Promise<Map<number, KoLessonTeacherUserLink>> {
  if (etrAuthDbState.devAuthEnabled) return new Map();
  await ensureUserKoTeacherLinkSchema(db);
  const result = await db
    .prepare(
      `SELECT link.user_id AS user_id, u.username AS username, link.teacher_id AS teacher_id
       FROM etr_user_ko_lesson_teacher_link link
       INNER JOIN etr_users u ON u.id = link.user_id`
    )
    .all<KoLessonTeacherUserLink>();
  const map = new Map<number, KoLessonTeacherUserLink>();
  for (const row of result.results ?? []) {
    const teacherId = Number(row.teacher_id);
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    map.set(teacherId, row);
  }
  return map;
}

export type EnsureKoLessonTeacherUserAccountResult =
  | { ok: true; created: boolean; user: EtrUser; password?: string }
  | { ok: false; error: string };

/** 一键为韩语上课老师创建/关联 ko_pron 账号 */
export async function ensureKoLessonTeacherUserAccount(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<EnsureKoLessonTeacherUserAccountResult> {
  const existingLink = await findKoLessonTeacherUserLink(env.DB, teacherId);
  if (existingLink) {
    const user = await ensureUserEnabledById(env.DB, existingLink.user_id);
    if (user) return { ok: true, created: false, user };
  }

  const provision = await createKoLessonTeacherUserByReview(
    env,
    teacherId,
    teacherName
  );
  if (provision.ok && provision.created) {
    return {
      ok: true,
      created: true,
      user: provision.user,
      password: provision.password,
    };
  }
  if (!provision.ok) {
    return { ok: false, error: provision.error };
  }

  if (provision.reason === "user_exists") {
    const baseUsername = normalizeUsername(teacherNameToUsername(teacherName));
    if (!baseUsername) return { ok: false, error: "username_invalid" };
    const existing = await findUserByUsername(env.DB, baseUsername);
    if (!existing) return { ok: false, error: "user_exists" };
    if (existing.role !== "ko_pron") {
      return { ok: false, error: "username_taken" };
    }
    await linkUserToKoLessonTeacher(env.DB, existing.id, teacherId);
    const enabled = await ensureUserEnabledById(env.DB, existing.id);
    if (!enabled) return { ok: false, error: "user_not_found" };
    return { ok: true, created: false, user: enabled };
  }

  return { ok: false, error: provision.reason ?? "username_unavailable" };
}

export type CreateKoLessonTeacherUserByReviewResult =
  | { ok: true; created: true; user: EtrUser; password: string }
  | { ok: true; created: false; reason: "user_exists" | "username_unavailable" }
  | { ok: false; error: string };

/** 为韩语老师创建 ko_pron 账号并写入老师-用户映射 */
export async function createKoLessonTeacherUserByReview(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<CreateKoLessonTeacherUserByReviewResult> {
  let baseUsername: string;
  try {
    baseUsername = teacherNameToUsername(teacherName);
  } catch {
    return { ok: false, error: "username_invalid" };
  }
  if (!baseUsername) return { ok: false, error: "username_invalid" };

  await ensureBootstrapUsers(env);

  const adminName = resolveAdminBootstrap(env)?.username ?? "Admin";
  const jpVocabName =
    resolveJpVocabBootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USERNAME;
  const jpVocabUser1Name =
    resolveJpVocabUser1Bootstrap(env)?.username ?? ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  const candidates = [baseUsername];
  for (let i = 2; i <= 99; i += 1) candidates.push(`${baseUsername}${i}`);

  let chosen: string | null = null;
  for (const candidate of candidates) {
    const username = normalizeUsername(candidate);
    if (!isValidUsername(username)) continue;
    if (isReservedUsername(username, adminName, jpVocabName, jpVocabUser1Name)) continue;
    const existing = await findUserByUsername(env.DB, username);
    if (existing) {
      if (candidate === baseUsername) return { ok: true, created: false, reason: "user_exists" };
      continue;
    }
    chosen = username;
    break;
  }

  if (!chosen) return { ok: true, created: false, reason: "username_unavailable" };

  const password = generateMemorableTeacherPassword(10);
  const created = await createUserByAdmin(env, chosen, password, "ko_pron");
  if (!created.ok) {
    if (created.error === "username_taken") {
      return { ok: true, created: false, reason: "user_exists" };
    }
    return { ok: false, error: created.error };
  }

  await linkUserToKoLessonTeacher(env.DB, created.user.id, teacherId);
  const enabled = await ensureUserEnabledById(env.DB, created.user.id);
  if (!enabled) return { ok: false, error: "user_not_found" };
  return { ok: true, created: true, user: enabled, password };
}
