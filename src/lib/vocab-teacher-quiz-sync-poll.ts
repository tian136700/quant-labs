/**
 * 老师端词表后台 sync：未开始抽查不轮询；抽查卡片打开时轮询；
 * 开卡后半小时无勾选则降频（不停）；今日目标抽完后以最后勾选起算再保留一小段时间后停掉。
 */

/** 最后活动后的「活跃窗」：抽完后再轮询多久；开卡后多久无勾选则降频 */
export const VOCAB_TEACHER_QUIZ_SYNC_POLL_GRACE_MS = 30 * 60 * 1000;

/** 半小时无勾选时：可见标签轮询间隔 */
export const VOCAB_TEACHER_QUIZ_SYNC_IDLE_MS = 5 * 60 * 1000;

/** 半小时无勾选时：后台标签轮询间隔 */
export const VOCAB_TEACHER_QUIZ_SYNC_IDLE_HIDDEN_MS = 10 * 60 * 1000;

export type VocabTeacherQuizSyncPollOptions = {
  /** 抽查卡片是否打开（开始/继续抽查） */
  showQuizFlashcard: boolean;
  /** 今日抽查目标是否已完成 */
  quizComplete: boolean;
  /**
   * 本会话最近一次勾选熟悉程度的时间（毫秒）。
   * 抽完后用它算 grace；无勾选记录则抽完后不续轮询。
   */
  lastQuizActionAtMs: number | null;
  nowMs?: number;
  graceMs?: number;
};

/**
 * 是否应开启老师端后台 sync / teacher-visible 轮询。
 *
 * - 未开卡片、未抽完 → false
 * - 抽查中卡片打开 → true（半小时无勾选只降频，不停）
 * - 已抽完：即使用户仍留在末词卡回看，也只按最后勾选起算 grace，超时必须停
 *   （禁止 `showQuizFlashcard` 在抽完后无限续命——曾导致 8s peek/live 打满 Worker → 1102）
 */
export function shouldEnableVocabTeacherQuizSyncPoll(
  opts: VocabTeacherQuizSyncPollOptions
): boolean {
  if (opts.quizComplete) {
    const lastAt = opts.lastQuizActionAtMs;
    if (lastAt == null || !Number.isFinite(lastAt) || lastAt <= 0) return false;
    const now = opts.nowMs ?? Date.now();
    const grace = opts.graceMs ?? VOCAB_TEACHER_QUIZ_SYNC_POLL_GRACE_MS;
    return now - lastAt < grace;
  }

  return Boolean(opts.showQuizFlashcard);
}

/** sessionReviewAt 映射 → 最近一次勾选时间；空则 null */
export function maxSessionReviewAtMs(
  sessionReviewAt: Record<number, number> | null | undefined
): number | null {
  if (!sessionReviewAt) return null;
  let max = 0;
  for (const v of Object.values(sessionReviewAt)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max > 0 ? max : null;
}

/**
 * 开卡时间与最后勾选取较晚者，作为「最后活动」。
 * 从未勾选时只用开卡时间。
 */
export function vocabTeacherQuizLastActivityAtMs(opts: {
  lastQuizActionAtMs: number | null;
  quizStartedAtMs: number | null;
}): number | null {
  let max = 0;
  for (const v of [opts.lastQuizActionAtMs, opts.quizStartedAtMs]) {
    const n = Number(v);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max > 0 ? max : null;
}

/**
 * 距最后活动已满 idleAfter（默认 30 分钟）→ 应降频。
 * 无活动时钟时视为 idle（保守降频）。
 */
export function isVocabTeacherQuizSyncIdle(opts: {
  lastActivityAtMs: number | null;
  nowMs?: number;
  /** 多久无活动算 idle；默认与 grace 同为 30 分钟 */
  idleAfterMs?: number;
}): boolean {
  const lastAt = opts.lastActivityAtMs;
  if (lastAt == null || !Number.isFinite(lastAt) || lastAt <= 0) return true;
  const now = opts.nowMs ?? Date.now();
  const idleAfter = opts.idleAfterMs ?? VOCAB_TEACHER_QUIZ_SYNC_POLL_GRACE_MS;
  return now - lastAt >= idleAfter;
}
