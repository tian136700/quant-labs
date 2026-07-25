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
  generateMemorableTeacherPassword,
} from "./users";
import { etrAuthDbState, nowIso } from "./state";

let userEnTeacherLinkSchemaEnsured = false;

async function ensureUserEnTeacherLinkSchema(db: D1Database): Promise<void> {
  if (etrAuthDbState.devAuthEnabled || userEnTeacherLinkSchemaEnsured) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_user_en_lesson_teacher_link (
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
      `CREATE INDEX IF NOT EXISTS idx_etr_user_en_lesson_teacher_link_teacher
       ON etr_user_en_lesson_teacher_link (teacher_id)`
    )
    .run();
  userEnTeacherLinkSchemaEnsured = true;
}

export async function linkUserToEnLessonTeacher(
  db: D1Database,
  userId: number,
  teacherId: number
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!Number.isInteger(teacherId) || teacherId <= 0) return;
  if (etrAuthDbState.devAuthEnabled) return;
  await ensureUserEnTeacherLinkSchema(db);
  const ts = nowIso();
  await db
    .prepare(
      `DELETE FROM etr_user_en_lesson_teacher_link
       WHERE teacher_id = ?1 AND user_id != ?2`
    )
    .bind(teacherId, userId)
    .run();
  await db
    .prepare(
      `INSERT INTO etr_user_en_lesson_teacher_link (user_id, teacher_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?3)
       ON CONFLICT(user_id) DO UPDATE SET teacher_id = excluded.teacher_id, updated_at = excluded.updated_at`
    )
    .bind(userId, teacherId, ts)
    .run();
}

export type EnLessonTeacherUserLink = {
  user_id: number;
  username: string;
  teacher_id: number;
};

export async function findEnLessonTeacherUserLink(
  db: D1Database,
  teacherId: number
): Promise<EnLessonTeacherUserLink | null> {
  if (etrAuthDbState.devAuthEnabled) return null;
  if (!Number.isInteger(teacherId) || teacherId <= 0) return null;
  await ensureUserEnTeacherLinkSchema(db);
  const row = await db
    .prepare(
      `SELECT link.user_id AS user_id, u.username AS username, link.teacher_id AS teacher_id
       FROM etr_user_en_lesson_teacher_link link
       INNER JOIN etr_users u ON u.id = link.user_id
       WHERE link.teacher_id = ?1`
    )
    .bind(teacherId)
    .first<EnLessonTeacherUserLink>();
  return row ?? null;
}

export async function listEnLessonTeacherUserLinkMapByTeacherId(
  db: D1Database
): Promise<Map<number, EnLessonTeacherUserLink>> {
  if (etrAuthDbState.devAuthEnabled) return new Map();
  await ensureUserEnTeacherLinkSchema(db);
  const result = await db
    .prepare(
      `SELECT link.user_id AS user_id, u.username AS username, link.teacher_id AS teacher_id
       FROM etr_user_en_lesson_teacher_link link
       INNER JOIN etr_users u ON u.id = link.user_id`
    )
    .all<EnLessonTeacherUserLink>();
  const map = new Map<number, EnLessonTeacherUserLink>();
  for (const row of result.results ?? []) {
    const teacherId = Number(row.teacher_id);
    if (!Number.isInteger(teacherId) || teacherId <= 0) continue;
    map.set(teacherId, row);
  }
  return map;
}

export type EnsureEnLessonTeacherUserAccountResult =
  | { ok: true; created: boolean; user: EtrUser; password?: string }
  | { ok: false; error: string };

/** 一键为英语上课老师创建/关联 en_vocab 账号 */
export async function ensureEnLessonTeacherUserAccount(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<EnsureEnLessonTeacherUserAccountResult> {
  const existingLink = await findEnLessonTeacherUserLink(env.DB, teacherId);
  if (existingLink) {
    const user = await ensureUserEnabledById(env.DB, existingLink.user_id);
    if (user) return { ok: true, created: false, user };
  }

  const provision = await createEnLessonTeacherUserByReview(
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
    if (existing.role !== "en_vocab") {
      return { ok: false, error: "username_taken" };
    }
    await linkUserToEnLessonTeacher(env.DB, existing.id, teacherId);
    const enabled = await ensureUserEnabledById(env.DB, existing.id);
    if (!enabled) return { ok: false, error: "user_not_found" };
    return { ok: true, created: false, user: enabled };
  }

  return { ok: false, error: provision.reason ?? "username_unavailable" };
}

export type CreateEnLessonTeacherUserByReviewResult =
  | { ok: true; created: true; user: EtrUser; password: string }
  | { ok: true; created: false; reason: "user_exists" | "username_unavailable" }
  | { ok: false; error: string };

/** 为英语老师创建 en_vocab 账号并写入老师-用户映射 */
export async function createEnLessonTeacherUserByReview(
  env: CloudflareEnv,
  teacherId: number,
  teacherName: string
): Promise<CreateEnLessonTeacherUserByReviewResult> {
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
    resolveJpVocabUser1Bootstrap(env)?.username ??
    ETR_DEFAULT_JP_VOCAB_USER1_USERNAME;

  const candidates = [baseUsername];
  for (let i = 2; i <= 99; i += 1) candidates.push(`${baseUsername}${i}`);

  let chosen: string | null = null;
  for (const candidate of candidates) {
    const username = normalizeUsername(candidate);
    if (!isValidUsername(username)) continue;
    if (isReservedUsername(username, adminName, jpVocabName, jpVocabUser1Name))
      continue;
    const existing = await findUserByUsername(env.DB, username);
    if (existing) {
      if (candidate === baseUsername)
        return { ok: true, created: false, reason: "user_exists" };
      continue;
    }
    chosen = username;
    break;
  }

  if (!chosen) return { ok: true, created: false, reason: "username_unavailable" };

  const password = generateMemorableTeacherPassword(10);
  const created = await createUserByAdmin(env, chosen, password, "en_vocab");
  if (!created.ok) {
    return { ok: false, error: created.error ?? "create_failed" };
  }
  await linkUserToEnLessonTeacher(env.DB, created.user.id, teacherId);
  const enabled = await ensureUserEnabledById(env.DB, created.user.id);
  if (!enabled) return { ok: false, error: "user_not_found" };
  return { ok: true, created: true, user: enabled, password };
}

/** 把已有用户绑定到英语老师（不新建账号） */
export async function setUserEnLessonTeacherLink(
  db: D1Database,
  userId: number,
  teacherId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(userId) || userId <= 0) {
    return { ok: false, error: "user_id_invalid" };
  }
  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return { ok: false, error: "teacher_id_invalid" };
  }
  const user = await findUserById(db, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  await linkUserToEnLessonTeacher(db, userId, teacherId);
  return { ok: true };
}
