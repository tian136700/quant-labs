import "server-only";

import { markEnVocabTeacherQuizDayDisabled } from "@/lib/en-vocab-teacher-quiz-day";
import { markJpVocabTeacherQuizDayDisabled } from "@/lib/jp-vocab-teacher-quiz-day";
import { markKoPronTeacherQuizDayDisabled } from "@/lib/ko-pron-teacher-quiz-day";

/**
 * 管理员手动启用账号时：把尚未执行的「抽完延时禁用」行标成已处理，
 * 避免 15 分钟定时任务再次把账号关掉。
 */
export async function cancelPendingTeacherQuizCompleteDisablesForUser(
  db: D1Database,
  userId: number,
  at = new Date()
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  const iso = at.toISOString();

  const markOpen = async (
    table: string,
    mark: (db: D1Database, userId: number, quizDate: string, at: string) => Promise<void>
  ) => {
    try {
      const result = await db
        .prepare(
          `SELECT quiz_date FROM ${table}
           WHERE user_id = ?1
             AND completed_at IS NOT NULL
             AND disabled_at IS NULL`
        )
        .bind(userId)
        .all<{ quiz_date: string }>();
      for (const row of result.results ?? []) {
        const quizDate = String(row.quiz_date ?? "").trim();
        if (!quizDate) continue;
        await mark(db, userId, quizDate, iso);
      }
    } catch {
      // 冷库缺表时忽略
    }
  };

  await markOpen("jp_vocab_teacher_quiz_day", markJpVocabTeacherQuizDayDisabled);
  await markOpen("ko_pron_teacher_quiz_day", markKoPronTeacherQuizDayDisabled);
  await markOpen("en_vocab_teacher_quiz_day", markEnVocabTeacherQuizDayDisabled);
}
