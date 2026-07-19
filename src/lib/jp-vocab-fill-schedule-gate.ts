import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { ensureJpVocabTeacherQuizDaySchema } from "@/lib/jp-vocab-teacher-quiz-day";

/** 今日最后一次抽查勾选后再等这么久，例句/释义补全才允许跑 */
export const JP_VOCAB_FILL_QUIZ_COOLDOWN_MS = 60 * 60 * 1000;

export type JpVocabFillScheduleGateResult = {
  quiet: boolean;
  reason: "ok_to_run" | "quiz_cooldown" | "no_quiz_today";
  detail: string;
  quiz_date: string;
  last_quiz_at: string | null;
  run_after: string | null;
  cooldown_minutes: number;
};

function parseIsoMs(raw: string | null | undefined): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * 例句/释义 Mac 定时任务门禁：
 * - 不再用固定 08:00–24:00 静默
 * - 今日有抽查勾选时：最后一次勾选（任一老师）后再等 1 小时才允许跑
 * - 今日尚无人抽查：允许跑
 */
export async function evaluateJpVocabFillScheduleGate(
  db: D1Database,
  now = new Date(),
  cooldownMs = JP_VOCAB_FILL_QUIZ_COOLDOWN_MS
): Promise<JpVocabFillScheduleGateResult> {
  await ensureJpVocabTeacherQuizDaySchema(db);
  const quizDate = beijingDateString(now);
  const cooldownMinutes = Math.max(1, Math.round(cooldownMs / 60000));

  const row = await db
    .prepare(
      `SELECT MAX(last_action_at) AS last_action_at,
              MAX(completed_at) AS completed_at
       FROM jp_vocab_teacher_quiz_day
       WHERE quiz_date = ?1`
    )
    .bind(quizDate)
    .first<{ last_action_at: string | null; completed_at: string | null }>();

  const actionMs = parseIsoMs(row?.last_action_at);
  const completedMs = parseIsoMs(row?.completed_at);
  const lastMs =
    actionMs == null
      ? completedMs
      : completedMs == null
        ? actionMs
        : Math.max(actionMs, completedMs);

  if (lastMs == null) {
    return {
      quiet: false,
      reason: "no_quiz_today",
      detail: `北京日期 ${quizDate} 尚无老师抽查记录，允许补全`,
      quiz_date: quizDate,
      last_quiz_at: null,
      run_after: null,
      cooldown_minutes: cooldownMinutes,
    };
  }

  const runAfterMs = lastMs + cooldownMs;
  const lastIso = new Date(lastMs).toISOString();
  const runAfterIso = new Date(runAfterMs).toISOString();
  const nowMs = now.getTime();

  if (nowMs < runAfterMs) {
    const remainMin = Math.max(1, Math.ceil((runAfterMs - nowMs) / 60000));
    return {
      quiet: true,
      reason: "quiz_cooldown",
      detail:
        `今日最后抽查 ${lastIso}，需再等 ${cooldownMinutes} 分钟后才跑` +
        `（约 ${remainMin} 分钟后 / run_after=${runAfterIso}）`,
      quiz_date: quizDate,
      last_quiz_at: lastIso,
      run_after: runAfterIso,
      cooldown_minutes: cooldownMinutes,
    };
  }

  return {
    quiet: false,
    reason: "ok_to_run",
    detail: `今日最后抽查 ${lastIso}，已超过 ${cooldownMinutes} 分钟冷却，允许补全`,
    quiz_date: quizDate,
    last_quiz_at: lastIso,
    run_after: runAfterIso,
    cooldown_minutes: cooldownMinutes,
  };
}
