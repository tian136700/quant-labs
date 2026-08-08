import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { getEnVocabTeacherQuizLive } from "@/lib/en-vocab-db";
import { ensureEnVocabTeacherQuizDaySchema } from "@/lib/en-vocab-teacher-quiz-day";
import { getJpVocabTeacherQuizLive } from "@/lib/jp-vocab-db";
import { ensureJpVocabTeacherQuizDaySchema } from "@/lib/jp-vocab-teacher-quiz-day";

/**
 * 日语/英语词表补全共用：今日最后一次抽查勾选后再等这么久才允许跑。
 * （用户约定：最后一词 17:00 抽完 → 17:30 之后才恢复 fill）
 */
export const JP_VOCAB_FILL_QUIZ_COOLDOWN_MS = 30 * 60 * 1000;

export type JpVocabFillScheduleGateResult = {
  quiet: boolean;
  reason:
    | "ok_to_run"
    | "quiz_cooldown"
    | "quiz_in_progress"
    | "no_quiz_today";
  detail: string;
  quiz_date: string;
  last_quiz_at: string | null;
  run_after: string | null;
  cooldown_minutes: number;
  /** 日语或英语老师抽查卡当前有 live 词 */
  live_open: boolean;
  subjects: Array<"jp" | "en">;
};

function parseIsoMs(raw: string | null | undefined): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function maxMs(...values: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (best == null || v > best) best = v;
  }
  return best;
}

type DayAgg = {
  last_action_at: string | null;
  completed_at: string | null;
};

async function readQuizDayAgg(
  db: D1Database,
  table: "jp_vocab_teacher_quiz_day" | "en_vocab_teacher_quiz_day",
  quizDate: string
): Promise<DayAgg> {
  const row = await db
    .prepare(
      `SELECT MAX(last_action_at) AS last_action_at,
              MAX(completed_at) AS completed_at
       FROM ${table}
       WHERE quiz_date = ?1`
    )
    .bind(quizDate)
    .first<{ last_action_at: string | null; completed_at: string | null }>();
  return {
    last_action_at: row?.last_action_at ?? null,
    completed_at: row?.completed_at ?? null,
  };
}

/** isolate 内短缓存：抽查中多 launchd 每分钟打门禁时少打 D1（Mac 侧另有文件缓存） */
const GATE_QUIET_CACHE_MS = 60_000;
const GATE_OK_CACHE_MS = 15_000;

type GateCacheEntry = {
  atMs: number;
  cooldownMs: number;
  result: JpVocabFillScheduleGateResult;
};

let gateIsolateCache: GateCacheEntry | null = null;

function gateCacheTtlMs(result: JpVocabFillScheduleGateResult): number {
  return result.quiet ? GATE_QUIET_CACHE_MS : GATE_OK_CACHE_MS;
}

/**
 * 日语+英语词表补全门禁（例句 / 统一 online / 英语 online 等共用）：
 * - 老师点「开始抽查」写入 live 词 → 立刻静默（即使尚未勾选）
 * - 抽查中（live 开着且当日未 completed）→ 持续静默
 * - 最后一词勾选后再等 cooldown（默认 30 分钟）才允许跑
 * - 今日无人抽查且无 live → 允许跑
 */
export async function evaluateJpVocabFillScheduleGate(
  db: D1Database,
  now = new Date(),
  cooldownMs = JP_VOCAB_FILL_QUIZ_COOLDOWN_MS
): Promise<JpVocabFillScheduleGateResult> {
  const nowMs = now.getTime();
  const cached = gateIsolateCache;
  if (
    cached &&
    cached.cooldownMs === cooldownMs &&
    nowMs - cached.atMs < gateCacheTtlMs(cached.result)
  ) {
    return cached.result;
  }

  await ensureJpVocabTeacherQuizDaySchema(db);
  await ensureEnVocabTeacherQuizDaySchema(db);

  const quizDate = beijingDateString(now);
  const cooldownMinutes = Math.max(1, Math.round(cooldownMs / 60000));

  // 门禁本身有 isolate 短缓存；live 用默认短缓存即可（勿每分钟 bypass 扫 D1）
  const [jpDay, enDay, jpLive, enLive] = await Promise.all([
    readQuizDayAgg(db, "jp_vocab_teacher_quiz_day", quizDate),
    readQuizDayAgg(db, "en_vocab_teacher_quiz_day", quizDate),
    getJpVocabTeacherQuizLive(db, now),
    getEnVocabTeacherQuizLive(db, now),
  ]);

  const jpLiveOpen =
    jpLive.date === quizDate &&
    jpLive.word_id != null &&
    Number(jpLive.word_id) > 0;
  const enLiveOpen =
    enLive.date === quizDate &&
    enLive.word_id != null &&
    Number(enLive.word_id) > 0;
  const liveOpen = jpLiveOpen || enLiveOpen;

  const subjects: Array<"jp" | "en"> = [];
  if (
    jpLiveOpen ||
    jpDay.last_action_at ||
    jpDay.completed_at
  ) {
    subjects.push("jp");
  }
  if (
    enLiveOpen ||
    enDay.last_action_at ||
    enDay.completed_at
  ) {
    subjects.push("en");
  }

  const lastMs = maxMs(
    parseIsoMs(jpDay.last_action_at),
    parseIsoMs(jpDay.completed_at),
    parseIsoMs(enDay.last_action_at),
    parseIsoMs(enDay.completed_at),
    jpLiveOpen ? parseIsoMs(jpLive.updated_at) : null,
    enLiveOpen ? parseIsoMs(enLive.updated_at) : null
  );

  const jpCompleted = parseIsoMs(jpDay.completed_at) != null;
  const enCompleted = parseIsoMs(enDay.completed_at) != null;
  const midQuiz =
    (jpLiveOpen && !jpCompleted) || (enLiveOpen && !enCompleted);

  let result: JpVocabFillScheduleGateResult;

  if (lastMs == null && !liveOpen) {
    result = {
      quiet: false,
      reason: "no_quiz_today",
      detail: `北京日期 ${quizDate} 尚无老师抽查记录，允许补全`,
      quiz_date: quizDate,
      last_quiz_at: null,
      run_after: null,
      cooldown_minutes: cooldownMinutes,
      live_open: false,
      subjects,
    };
  } else {
    const anchorMs = lastMs ?? nowMs;
    const runAfterMs = anchorMs + cooldownMs;
    const lastIso = new Date(anchorMs).toISOString();
    const runAfterIso = new Date(runAfterMs).toISOString();

    if (midQuiz) {
      result = {
        quiet: true,
        reason: "quiz_in_progress",
        detail:
          `老师抽查进行中（live 开着且今日未抽完），日/英语词表补全全部跳过` +
          `（last=${lastIso}）`,
        quiz_date: quizDate,
        last_quiz_at: lastIso,
        run_after: runAfterIso,
        cooldown_minutes: cooldownMinutes,
        live_open: liveOpen,
        subjects,
      };
    } else if (nowMs < runAfterMs) {
      const remainMin = Math.max(1, Math.ceil((runAfterMs - nowMs) / 60000));
      result = {
        quiet: true,
        reason: "quiz_cooldown",
        detail:
          `今日最后抽查 ${lastIso}，需再等 ${cooldownMinutes} 分钟后才跑` +
          `（约 ${remainMin} 分钟后 / run_after=${runAfterIso}）`,
        quiz_date: quizDate,
        last_quiz_at: lastIso,
        run_after: runAfterIso,
        cooldown_minutes: cooldownMinutes,
        live_open: liveOpen,
        subjects,
      };
    } else {
      result = {
        quiet: false,
        reason: "ok_to_run",
        detail: `今日最后抽查 ${lastIso}，已超过 ${cooldownMinutes} 分钟冷却，允许补全`,
        quiz_date: quizDate,
        last_quiz_at: lastIso,
        run_after: runAfterIso,
        cooldown_minutes: cooldownMinutes,
        live_open: liveOpen,
        subjects,
      };
    }
  }

  gateIsolateCache = { atMs: nowMs, cooldownMs, result };
  return result;
}
