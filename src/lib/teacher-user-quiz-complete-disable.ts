import "server-only";

import { findUserById, revokeUserSessions } from "@/lib/etr-auth-db";
import {
  listJpVocabTeacherQuizDaysDueForDisable,
  markJpVocabTeacherQuizDayDisabled,
  shouldTrackJpVocabTeacherQuizDay,
} from "@/lib/jp-vocab-teacher-quiz-day";
import {
  listKoPronTeacherQuizDaysDueForDisable,
  markKoPronTeacherQuizDayDisabled,
  shouldTrackKoPronTeacherQuizDay,
} from "@/lib/ko-pron-teacher-quiz-day";
import {
  listEnVocabTeacherQuizDaysDueForDisable,
  markEnVocabTeacherQuizDayDisabled,
  shouldTrackEnVocabTeacherQuizDay,
} from "@/lib/en-vocab-teacher-quiz-day";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  isTeacherUserDisableSuppressedForDisableAt,
  listTeacherUserDisableSuppressAfterByUserId,
} from "@/lib/teacher-user-disable-suppress";
import {
  isExcludedFromTeacherScheduleAutoEnable,
  listLinkedUserIdsWithClassNearNow,
  TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
} from "@/lib/teacher-user-schedule-enable";

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
    subject?: "jp" | "ko" | "en";
  }>;
  skipped: Array<{
    user_id: number;
    username: string;
    quiz_date: string;
    reason: string;
    subject?: "jp" | "ko" | "en";
  }>;
};

type DueRow = {
  user_id: number;
  username: string;
  quiz_date: string;
  completed_at: string | null;
  disable_after_at: string | null;
  subject: "jp" | "ko" | "en";
};

/**
 * 今日抽查完成后的延时自动禁用：
 * - 日语普通老师：completed_at + 1h；带读账号 + 2h
 * - 韩语老师：completed_at + 20min
 * - 英语老师：completed_at + 1h
 * 与「开课前自动启用」对称；排除 admin / user1 / test。
 */
export async function runTeacherUserQuizCompleteDisable(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<TeacherUserQuizCompleteDisableResult> {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();
  const date = beijingDateString(now);
  const jpDue = await listJpVocabTeacherQuizDaysDueForDisable(db, now);
  const koDue = await listKoPronTeacherQuizDaysDueForDisable(db, now);
  const enDue = await listEnVocabTeacherQuizDaysDueForDisable(db, now);
  const dueRows: DueRow[] = [
    ...jpDue.map((row) => ({ ...row, subject: "jp" as const })),
    ...koDue.map((row) => ({ ...row, subject: "ko" as const })),
    ...enDue.map((row) => ({ ...row, subject: "en" as const })),
  ];
  const nearClassUserIds = await listLinkedUserIdsWithClassNearNow(db, {
    beforeMs: TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
    afterMs: TEACHER_QUIZ_DISABLE_SKIP_NEAR_CLASS_MS,
    now,
  });
  const suppressMap = await listTeacherUserDisableSuppressAfterByUserId(
    db,
    dueRows.map((row) => Number(row.user_id))
  );

  const disabled: TeacherUserQuizCompleteDisableResult["disabled"] = [];
  const skipped: TeacherUserQuizCompleteDisableResult["skipped"] = [];

  for (const row of dueRows) {
    const userId = Number(row.user_id);
    const username = String(row.username ?? "").trim();
    const quizDate = String(row.quiz_date ?? "");
    const subject = row.subject;

    const markDisabled = async () => {
      if (dryRun) return;
      if (subject === "ko") {
        await markKoPronTeacherQuizDayDisabled(
          db,
          userId,
          quizDate,
          now.toISOString()
        );
      } else if (subject === "en") {
        await markEnVocabTeacherQuizDayDisabled(
          db,
          userId,
          quizDate,
          now.toISOString()
        );
      } else {
        await markJpVocabTeacherQuizDayDisabled(
          db,
          userId,
          quizDate,
          now.toISOString()
        );
      }
    };

    if (!Number.isInteger(userId) || userId <= 0 || !quizDate) {
      skipped.push({
        user_id: userId,
        username,
        quiz_date: quizDate,
        reason: "invalid_row",
        subject,
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
        subject,
      });
      await markDisabled();
      continue;
    }

    const shouldTrack =
      subject === "ko"
        ? shouldTrackKoPronTeacherQuizDay(user)
        : subject === "en"
          ? shouldTrackEnVocabTeacherQuizDay(user)
          : shouldTrackJpVocabTeacherQuizDay(user);

    if (isExcludedFromTeacherScheduleAutoEnable(user) || !shouldTrack) {
      skipped.push({
        user_id: userId,
        username: user.username,
        quiz_date: quizDate,
        reason: "excluded_account",
        subject,
      });
      await markDisabled();
      continue;
    }

    if ((user.disabled ?? 0) !== 0) {
      skipped.push({
        user_id: userId,
        username: user.username,
        quiz_date: quizDate,
        reason: "already_disabled",
        subject,
      });
      await markDisabled();
      continue;
    }

    // 开课前/课中临近窗口：不禁，留给下次再判（勿 mark disabled，否则再也进不了 due）
    if (nearClassUserIds.has(userId)) {
      skipped.push({
        user_id: userId,
        username: user.username,
        quiz_date: quizDate,
        reason: "near_upcoming_or_ongoing_class",
        subject,
      });
      continue;
    }

    // 管理员手动启用后压制：勿再禁（disable_after 当作本节禁用点）
    const disableAfterMs = row.disable_after_at
      ? Date.parse(row.disable_after_at)
      : NaN;
    if (
      Number.isFinite(disableAfterMs) &&
      isTeacherUserDisableSuppressedForDisableAt(
        suppressMap.get(userId),
        disableAfterMs
      )
    ) {
      skipped.push({
        user_id: userId,
        username: user.username,
        quiz_date: quizDate,
        reason: "manual_enable_suppress",
        subject,
      });
      await markDisabled();
      continue;
    }

    if (!dryRun) {
      await db
        .prepare(`UPDATE etr_users SET disabled = 1 WHERE id = ?1`)
        .bind(userId)
        .run();
      await revokeUserSessions(db, userId);
      await markDisabled();
    }

    disabled.push({
      user_id: userId,
      username: user.username,
      quiz_date: quizDate,
      completed_at: row.completed_at,
      disable_after_at: row.disable_after_at,
      subject,
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
