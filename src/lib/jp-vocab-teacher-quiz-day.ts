import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { getJpVocabDailyQuizProgress } from "@/lib/jp-vocab-db";
import {
  canAccessJpVocabCoach,
  type EtrUser,
} from "@/lib/etr-auth";
import { isExcludedFromTeacherScheduleAutoEnable } from "@/lib/teacher-user-schedule-enable";

/** 普通老师：今日抽完后多久自动禁用 */
export const JP_VOCAB_TEACHER_QUIZ_DISABLE_DELAY_MS = 60 * 60 * 1000;

/** 课堂带读账号（欣欣等）：抽完后多久自动禁用 */
export const JP_VOCAB_COACH_QUIZ_DISABLE_DELAY_MS = 2 * 60 * 60 * 1000;

export type JpVocabTeacherQuizDayRow = {
  user_id: number;
  quiz_date: string;
  username: string;
  last_action_at: string;
  completed_at: string | null;
  disable_after_at: string | null;
  disabled_at: string | null;
};

let schemaReady = false;

export function jpVocabTeacherQuizDisableDelayMs(
  user: Pick<EtrUser, "username" | "role"> & { permissions?: string[] }
): number {
  // 带读白名单 / jp_vocab:coach：多留 2 小时做课堂带读；管理员不走此路径
  if (user.role !== "admin" && canAccessJpVocabCoach(user)) {
    return JP_VOCAB_COACH_QUIZ_DISABLE_DELAY_MS;
  }
  return JP_VOCAB_TEACHER_QUIZ_DISABLE_DELAY_MS;
}

export function shouldTrackJpVocabTeacherQuizDay(
  user: Pick<EtrUser, "id" | "username" | "role"> | null | undefined
): boolean {
  if (!user) return false;
  if (!Number.isInteger(user.id) || user.id <= 0) return false;
  if (isExcludedFromTeacherScheduleAutoEnable(user)) return false;
  return true;
}

export async function ensureJpVocabTeacherQuizDaySchema(
  db: D1Database
): Promise<void> {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_vocab_teacher_quiz_day (
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
      `CREATE INDEX IF NOT EXISTS idx_jp_vocab_teacher_quiz_day_disable
       ON jp_vocab_teacher_quiz_day (quiz_date, disabled_at, disable_after_at)`
    )
    .run();
  schemaReady = true;
}

/**
 * 老师勾选熟悉程度后：记录操作人；若今日抽查目标已完成，写下 completed_at
 * 与 disable_after_at（普通 1h / 带读 2h），供定时任务自动禁用。
 * 不写在 jp_vocab_word 上（词条全员共用，粒度也不对）。
 */
export async function trackJpVocabTeacherQuizDayAfterReview(
  db: D1Database,
  user: Pick<EtrUser, "id" | "username" | "role"> & { permissions?: string[] },
  now = new Date()
): Promise<{ tracked: boolean; completed: boolean }> {
  if (!shouldTrackJpVocabTeacherQuizDay(user)) {
    return { tracked: false, completed: false };
  }

  await ensureJpVocabTeacherQuizDaySchema(db);

  const quizDate = beijingDateString(now);
  const actionAt = now.toISOString();
  const username = String(user.username ?? "").trim();
  if (!username) return { tracked: false, completed: false };

  const existing = await db
    .prepare(
      `SELECT user_id, quiz_date, username, last_action_at, completed_at,
              disable_after_at, disabled_at
       FROM jp_vocab_teacher_quiz_day
       WHERE user_id = ?1 AND quiz_date = ?2`
    )
    .bind(user.id, quizDate)
    .first<JpVocabTeacherQuizDayRow>();

  if (existing) {
    await db
      .prepare(
        `UPDATE jp_vocab_teacher_quiz_day
         SET username = ?1, last_action_at = ?2
         WHERE user_id = ?3 AND quiz_date = ?4`
      )
      .bind(username, actionAt, user.id, quizDate)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO jp_vocab_teacher_quiz_day
           (user_id, quiz_date, username, last_action_at, completed_at, disable_after_at, disabled_at)
         VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL)`
      )
      .bind(user.id, quizDate, username, actionAt)
      .run();
  }

  // 已记过抽完则只更新 last_action_at，不改禁用计划
  if (existing?.completed_at) {
    return { tracked: true, completed: true };
  }

  const progress = await getJpVocabDailyQuizProgress(db, now);
  if (!progress.complete) {
    return { tracked: true, completed: false };
  }

  const delayMs = jpVocabTeacherQuizDisableDelayMs(user);
  const disableAfterAt = new Date(now.getTime() + delayMs).toISOString();

  await db
    .prepare(
      `UPDATE jp_vocab_teacher_quiz_day
       SET completed_at = ?1, disable_after_at = ?2
       WHERE user_id = ?3 AND quiz_date = ?4 AND completed_at IS NULL`
    )
    .bind(actionAt, disableAfterAt, user.id, quizDate)
    .run();

  return { tracked: true, completed: true };
}

/** 已到点、尚未执行自动禁用的行 */
export async function listJpVocabTeacherQuizDaysDueForDisable(
  db: D1Database,
  now = new Date()
): Promise<JpVocabTeacherQuizDayRow[]> {
  await ensureJpVocabTeacherQuizDaySchema(db);
  const nowIso = now.toISOString();
  const result = await db
    .prepare(
      `SELECT user_id, quiz_date, username, last_action_at, completed_at,
              disable_after_at, disabled_at
       FROM jp_vocab_teacher_quiz_day
       WHERE completed_at IS NOT NULL
         AND disabled_at IS NULL
         AND disable_after_at IS NOT NULL
         AND disable_after_at <= ?1
       ORDER BY disable_after_at ASC
       LIMIT 50`
    )
    .bind(nowIso)
    .all<JpVocabTeacherQuizDayRow>();
  return result.results ?? [];
}

export async function markJpVocabTeacherQuizDayDisabled(
  db: D1Database,
  userId: number,
  quizDate: string,
  disabledAt: string
): Promise<void> {
  await ensureJpVocabTeacherQuizDaySchema(db);
  await db
    .prepare(
      `UPDATE jp_vocab_teacher_quiz_day
       SET disabled_at = ?1
       WHERE user_id = ?2 AND quiz_date = ?3 AND disabled_at IS NULL`
    )
    .bind(disabledAt, userId, quizDate)
    .run();
}
