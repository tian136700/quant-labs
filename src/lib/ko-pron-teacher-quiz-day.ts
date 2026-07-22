import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { getKoPronDailyQuizProgress } from "@/lib/ko-pron-db";
import type { EtrUser } from "@/lib/etr-auth";
import { isExcludedFromTeacherScheduleAutoEnable } from "@/lib/teacher-user-schedule-enable";

/** 韩语老师：今日抽完最后一个字母后多久自动禁用 */
export const KO_PRON_TEACHER_QUIZ_DISABLE_DELAY_MS = 20 * 60 * 1000;

export type KoPronTeacherQuizDayRow = {
  user_id: number;
  quiz_date: string;
  username: string;
  last_action_at: string;
  completed_at: string | null;
  disable_after_at: string | null;
  disabled_at: string | null;
};

let schemaReady = false;

export function koPronTeacherQuizDisableDelayMs(
  _user: Pick<EtrUser, "username" | "role">
): number {
  return KO_PRON_TEACHER_QUIZ_DISABLE_DELAY_MS;
}

export function shouldTrackKoPronTeacherQuizDay(
  user: Pick<EtrUser, "id" | "username" | "role"> | null | undefined
): boolean {
  if (!user) return false;
  if (!Number.isInteger(user.id) || user.id <= 0) return false;
  if (isExcludedFromTeacherScheduleAutoEnable(user)) return false;
  return true;
}

export async function ensureKoPronTeacherQuizDaySchema(
  db: D1Database
): Promise<void> {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ko_pron_teacher_quiz_day (
         user_id INTEGER NOT NULL,
         quiz_date TEXT NOT NULL,
         username TEXT NOT NULL,
         last_action_at TEXT NOT NULL,
         completed_at TEXT,
         disable_after_at TEXT,
         disabled_at TEXT,
         PRIMARY KEY (user_id, quiz_date)
       )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_ko_pron_teacher_quiz_day_disable
       ON ko_pron_teacher_quiz_day (quiz_date, disabled_at, disable_after_at)`
    )
    .run();
  schemaReady = true;
}

/**
 * 韩语老师勾选熟悉程度后：记录操作人；若今日抽查目标已完成，写下 completed_at
 * 与 disable_after_at（+20 分钟），供定时任务自动禁用。
 */
export async function trackKoPronTeacherQuizDayAfterReview(
  db: D1Database,
  user: Pick<EtrUser, "id" | "username" | "role">,
  now = new Date()
): Promise<{ tracked: boolean; completed: boolean }> {
  if (!shouldTrackKoPronTeacherQuizDay(user)) {
    return { tracked: false, completed: false };
  }

  await ensureKoPronTeacherQuizDaySchema(db);

  const quizDate = beijingDateString(now);
  const actionAt = now.toISOString();
  const username = String(user.username ?? "").trim();
  if (!username) return { tracked: false, completed: false };

  const existing = await db
    .prepare(
      `SELECT user_id, quiz_date, username, last_action_at, completed_at,
              disable_after_at, disabled_at
       FROM ko_pron_teacher_quiz_day
       WHERE user_id = ?1 AND quiz_date = ?2`
    )
    .bind(user.id, quizDate)
    .first<KoPronTeacherQuizDayRow>();

  if (existing) {
    await db
      .prepare(
        `UPDATE ko_pron_teacher_quiz_day
         SET username = ?1, last_action_at = ?2
         WHERE user_id = ?3 AND quiz_date = ?4`
      )
      .bind(username, actionAt, user.id, quizDate)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO ko_pron_teacher_quiz_day
           (user_id, quiz_date, username, last_action_at, completed_at, disable_after_at, disabled_at)
         VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL)`
      )
      .bind(user.id, quizDate, username, actionAt)
      .run();
  }

  if (existing?.completed_at) {
    return { tracked: true, completed: true };
  }

  const progress = await getKoPronDailyQuizProgress(db, now);
  if (!progress.complete) {
    return { tracked: true, completed: false };
  }

  const delayMs = koPronTeacherQuizDisableDelayMs(user);
  const disableAfterAt = new Date(now.getTime() + delayMs).toISOString();

  await db
    .prepare(
      `UPDATE ko_pron_teacher_quiz_day
       SET completed_at = ?1, disable_after_at = ?2
       WHERE user_id = ?3 AND quiz_date = ?4 AND completed_at IS NULL`
    )
    .bind(actionAt, disableAfterAt, user.id, quizDate)
    .run();

  return { tracked: true, completed: true };
}

/** 已到点、尚未执行自动禁用的行 */
export async function listKoPronTeacherQuizDaysDueForDisable(
  db: D1Database,
  now = new Date()
): Promise<KoPronTeacherQuizDayRow[]> {
  await ensureKoPronTeacherQuizDaySchema(db);
  const nowIso = now.toISOString();
  const result = await db
    .prepare(
      `SELECT user_id, quiz_date, username, last_action_at, completed_at,
              disable_after_at, disabled_at
       FROM ko_pron_teacher_quiz_day
       WHERE completed_at IS NOT NULL
         AND disabled_at IS NULL
         AND disable_after_at IS NOT NULL
         AND disable_after_at <= ?1
       ORDER BY disable_after_at ASC
       LIMIT 50`
    )
    .bind(nowIso)
    .all<KoPronTeacherQuizDayRow>();
  return result.results ?? [];
}

export async function markKoPronTeacherQuizDayDisabled(
  db: D1Database,
  userId: number,
  quizDate: string,
  disabledAt: string
): Promise<void> {
  await ensureKoPronTeacherQuizDaySchema(db);
  await db
    .prepare(
      `UPDATE ko_pron_teacher_quiz_day
       SET disabled_at = ?1
       WHERE user_id = ?2 AND quiz_date = ?3 AND disabled_at IS NULL`
    )
    .bind(disabledAt, userId, quizDate)
    .run();
}
