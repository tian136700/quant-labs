import "server-only";

import { findUserById, revokeUserSessions } from "@/lib/etr-auth-db";
import {
  listJpVocabTeacherQuizDaysDueForDisable,
  markJpVocabTeacherQuizDayDisabled,
  shouldTrackJpVocabTeacherQuizDay,
} from "@/lib/jp-vocab-teacher-quiz-day";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { isExcludedFromTeacherScheduleAutoEnable } from "@/lib/teacher-user-schedule-enable";

export type TeacherUserQuizCompleteDisableResult = {
  date: string;
  dry_run: boolean;
  due: number;
  disabled: Array<{
    user_id: number;
    username: string;
    quiz_date: string;
    completed_at: string | null;
    disable_after_at: string | null;
  }>;
  skipped: Array<{
    user_id: number;
    username: string;
    quiz_date: string;
    reason: string;
  }>;
};

/**
 * 今日抽查完成后的延时自动禁用：
 * - 普通老师：completed_at + 1h
 * - 带读账号（欣欣等）：completed_at + 2h
 * 与「今日有课 05:00 自动启用」对称；排除 admin / user1 / test。
 */
export async function runTeacherUserQuizCompleteDisable(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<TeacherUserQuizCompleteDisableResult> {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();
  const date = beijingDateString(now);
  const dueRows = await listJpVocabTeacherQuizDaysDueForDisable(db, now);

  const disabled: TeacherUserQuizCompleteDisableResult["disabled"] = [];
  const skipped: TeacherUserQuizCompleteDisableResult["skipped"] = [];

  for (const row of dueRows) {
    const userId = Number(row.user_id);
    const username = String(row.username ?? "").trim();
    const quizDate = String(row.quiz_date ?? "");

    if (!Number.isInteger(userId) || userId <= 0 || !quizDate) {
      skipped.push({
        user_id: userId,
        username,
        quiz_date: quizDate,
        reason: "invalid_row",
      });
      continue;
    }

    const user = await findUserById(db, userId);
    if (!user) {
      skipped.push({
        user_id: userId,
        username,
        quiz_date: quizDate,
        reason: "user_not_found",
      });
      // 用户已删：仍标记，避免反复扫到
      if (!dryRun) {
        await markJpVocabTeacherQuizDayDisabled(db, userId, quizDate, now.toISOString());
      }
      continue;
    }

    if (
      isExcludedFromTeacherScheduleAutoEnable(user) ||
      !shouldTrackJpVocabTeacherQuizDay(user)
    ) {
      skipped.push({
        user_id: userId,
        username: user.username,
        quiz_date: quizDate,
        reason: "excluded_account",
      });
      if (!dryRun) {
        await markJpVocabTeacherQuizDayDisabled(db, userId, quizDate, now.toISOString());
      }
      continue;
    }

    if ((user.disabled ?? 0) !== 0) {
      skipped.push({
        user_id: userId,
        username: user.username,
        quiz_date: quizDate,
        reason: "already_disabled",
      });
      if (!dryRun) {
        await markJpVocabTeacherQuizDayDisabled(db, userId, quizDate, now.toISOString());
      }
      continue;
    }

    if (!dryRun) {
      await db
        .prepare(`UPDATE etr_users SET disabled = 1 WHERE id = ?1`)
        .bind(userId)
        .run();
      await revokeUserSessions(db, userId);
      await markJpVocabTeacherQuizDayDisabled(db, userId, quizDate, now.toISOString());
    }

    disabled.push({
      user_id: userId,
      username: user.username,
      quiz_date: quizDate,
      completed_at: row.completed_at,
      disable_after_at: row.disable_after_at,
    });
  }

  return {
    date,
    dry_run: dryRun,
    due: dueRows.length,
    disabled,
    skipped,
  };
}
