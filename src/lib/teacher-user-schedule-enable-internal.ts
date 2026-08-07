import "server-only";

import { revokeUserSessions } from "@/lib/etr-auth-db";
import type { EtrUser, EtrUserRole } from "@/lib/etr-auth";
import {
  clearTeacherUserDisableSuppressMany,
  isTeacherUserDisableSuppressedForDisableAt,
  listTeacherUserDisableSuppressAfterByUserId,
} from "@/lib/teacher-user-disable-suppress";
import { listLinkedEnTeacherUsersForTeacherIds } from "@/lib/teacher-user-en-schedule";
import {
  isExcludedFromTeacherScheduleAutoEnable,
  type TeacherUserEnableHit,
  type TeacherUserEnableSkip,
} from "@/lib/teacher-user-schedule-enable-types";

export type LinkedTeacherUser = {
  user_id: number;
  username: string;
  role: string;
  disabled: number;
  never_disable: number;
  teacher_id: number;
};

function linkedRowAsUser(
  row: LinkedTeacherUser,
  username: string
): Pick<EtrUser, "role" | "username" | "never_disable" | "disabled"> {
  return {
    role: String(row.role ?? "user") as EtrUserRole,
    username,
    never_disable: Number(row.never_disable ?? 0),
    disabled: Number(row.disabled ?? 0),
  };
}

const LINKED_TEACHER_USER_SELECT = `SELECT link.user_id AS user_id, u.username AS username, u.role AS role,
              COALESCE(u.disabled, 0) AS disabled,
              COALESCE(u.never_disable, 0) AS never_disable,
              link.teacher_id AS teacher_id`;

export async function listLinkedTeacherUsersForTeacherIds(
  db: D1Database,
  teacherIds: number[]
): Promise<LinkedTeacherUser[]> {
  if (!teacherIds.length) return [];
  const placeholders = teacherIds.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(
      `${LINKED_TEACHER_USER_SELECT}
       FROM etr_user_jp_lesson_teacher_link link
       INNER JOIN etr_users u ON u.id = link.user_id
       WHERE link.teacher_id IN (${placeholders})`
    )
    .bind(...teacherIds)
    .all<LinkedTeacherUser>();
  return result.results ?? [];
}

export async function listLinkedKoTeacherUsersForTeacherIds(
  db: D1Database,
  teacherIds: number[]
): Promise<LinkedTeacherUser[]> {
  if (!teacherIds.length) return [];
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS etr_user_ko_lesson_teacher_link (
         user_id INTEGER PRIMARY KEY,
         teacher_id INTEGER NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    )
    .run();
  const placeholders = teacherIds.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(
      `${LINKED_TEACHER_USER_SELECT}
       FROM etr_user_ko_lesson_teacher_link link
       INNER JOIN etr_users u ON u.id = link.user_id
       WHERE link.teacher_id IN (${placeholders})`
    )
    .bind(...teacherIds)
    .all<LinkedTeacherUser>();
  return result.results ?? [];
}

export async function enableLinkedTeacherUsersForTeacherIds(
  db: D1Database,
  teacherIds: number[],
  options: { dryRun?: boolean; subject?: "jp" | "ko" | "en" } = {}
): Promise<{ enabled: TeacherUserEnableHit[]; skipped: TeacherUserEnableSkip[] }> {
  const dryRun = Boolean(options.dryRun);
  const subject = options.subject ?? "jp";
  const linkedUsers =
    subject === "ko"
      ? await listLinkedKoTeacherUsersForTeacherIds(db, teacherIds)
      : subject === "en"
        ? await listLinkedEnTeacherUsersForTeacherIds(db, teacherIds)
        : await listLinkedTeacherUsersForTeacherIds(db, teacherIds);
  const enabled: TeacherUserEnableHit[] = [];
  const skipped: TeacherUserEnableSkip[] = [];
  const enabledUserIds: number[] = [];

  for (const row of linkedUsers) {
    const userId = Number(row.user_id);
    const teacherId = Number(row.teacher_id);
    const username = String(row.username ?? "").trim();
    if (!Number.isInteger(userId) || userId <= 0 || !username) continue;

    const user = linkedRowAsUser(row, username);

    if (isExcludedFromTeacherScheduleAutoEnable(user)) {
      skipped.push({
        user_id: userId,
        username,
        teacher_id: teacherId,
        reason: "excluded_account",
      });
      continue;
    }

    if ((user.disabled ?? 0) === 0) {
      skipped.push({
        user_id: userId,
        username,
        teacher_id: teacherId,
        reason: "already_enabled",
      });
      continue;
    }

    if (!dryRun) {
      await db
        .prepare(`UPDATE etr_users SET disabled = 0 WHERE id = ?1`)
        .bind(userId)
        .run();
      enabledUserIds.push(userId);
    }

    enabled.push({ user_id: userId, username, teacher_id: teacherId });
  }

  if (!dryRun && enabledUserIds.length) {
    await clearTeacherUserDisableSuppressMany(db, enabledUserIds);
  }

  return { enabled, skipped };
}

export async function disableLinkedTeacherUsersForTeacherIds(
  db: D1Database,
  teacherIds: number[],
  options: {
    dryRun?: boolean;
    /** teacher_id → 本节课下课+宽限时刻（ms）；有压制则跳过 */
    latestDisableAtByTeacherId?: Map<number, number>;
  } = {}
): Promise<{
  disabled: TeacherUserEnableHit[];
  skipped: TeacherUserEnableSkip[];
}> {
  const dryRun = Boolean(options.dryRun);
  const linkedUsers = await listLinkedTeacherUsersForTeacherIds(db, teacherIds);
  const disabled: TeacherUserEnableHit[] = [];
  const skipped: TeacherUserEnableSkip[] = [];

  const suppressMap = await listTeacherUserDisableSuppressAfterByUserId(
    db,
    linkedUsers.map((r) => Number(r.user_id))
  );

  for (const row of linkedUsers) {
    const userId = Number(row.user_id);
    const teacherId = Number(row.teacher_id);
    const username = String(row.username ?? "").trim();
    if (!Number.isInteger(userId) || userId <= 0 || !username) continue;

    const user = linkedRowAsUser(row, username);

    if (isExcludedFromTeacherScheduleAutoEnable(user)) {
      skipped.push({
        user_id: userId,
        username,
        teacher_id: teacherId,
        reason: "excluded_account",
      });
      continue;
    }

    if ((user.disabled ?? 0) !== 0) {
      skipped.push({
        user_id: userId,
        username,
        teacher_id: teacherId,
        reason: "already_disabled",
      });
      continue;
    }

    const latestDisableAt = options.latestDisableAtByTeacherId?.get(teacherId);
    if (
      latestDisableAt != null &&
      isTeacherUserDisableSuppressedForDisableAt(
        suppressMap.get(userId),
        latestDisableAt
      )
    ) {
      skipped.push({
        user_id: userId,
        username,
        teacher_id: teacherId,
        reason: "manual_enable_suppress",
      });
      continue;
    }

    if (!dryRun) {
      await db
        .prepare(`UPDATE etr_users SET disabled = 1 WHERE id = ?1`)
        .bind(userId)
        .run();
      await revokeUserSessions(db, userId);
    }

    disabled.push({ user_id: userId, username, teacher_id: teacherId });
  }

  return { disabled, skipped };
}
