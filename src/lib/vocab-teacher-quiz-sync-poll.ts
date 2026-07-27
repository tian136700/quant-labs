/**
 * 老师端词表后台 sync：未开始抽查不轮询；抽查卡片打开时轮询；
 * 今日目标抽完后，以「最后一次勾选熟悉程度」起算再保留一小段时间后停掉。
 */

/** 最后一个词勾完后再轮询多久（半小时内不会再加今日抽查词） */
export const VOCAB_TEACHER_QUIZ_SYNC_POLL_GRACE_MS = 30 * 60 * 1000;

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
 * - 未开卡片、未在 grace → false
 * - 卡片打开 → true
 * - 已抽完且距最后勾选 < grace → true
 * - 已抽完且超过 grace → false
 */
export function shouldEnableVocabTeacherQuizSyncPoll(
  opts: VocabTeacherQuizSyncPollOptions
): boolean {
  if (opts.showQuizFlashcard) return true;

  if (!opts.quizComplete) return false;

  const lastAt = opts.lastQuizActionAtMs;
  if (lastAt == null || !Number.isFinite(lastAt) || lastAt <= 0) return false;

  const now = opts.nowMs ?? Date.now();
  const grace = opts.graceMs ?? VOCAB_TEACHER_QUIZ_SYNC_POLL_GRACE_MS;
  return now - lastAt < grace;
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
