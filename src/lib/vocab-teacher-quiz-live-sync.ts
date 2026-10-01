/** 老师抽查 live 词同步 / 学生 peek：超时与重试（改前见 vocab-teacher-quiz-live-sync.mdc） */

/** 老师 PUT live：单次请求墙钟超时（避免一直挂起导致学生 peek 永远 no_active_word） */
export const VOCAB_TEACHER_QUIZ_LIVE_SYNC_TIMEOUT_MS = 12_000;

/** PUT 失败后重试间隔（基线；连失败时用 backoff） */
export const VOCAB_TEACHER_QUIZ_LIVE_SYNC_RETRY_MS = 2_500;

/** peek / live 失败退避上限（曾：1102 时仍每 8s/2.5s 硬打 → 死亡螺旋） */
export const VOCAB_TEACHER_QUIZ_LIVE_POLL_BACKOFF_CAP_MS = 60_000;

/** 学生 POST peek：超时后提示重试，禁止无限转圈 */
export const VOCAB_STUDENT_PEEK_TIMEOUT_MS = 20_000;

/** peek 轮询：连续失败时指数拉长间隔，成功后归零 */
export function vocabTeacherQuizLivePollBackoffMs(
  baseMs: number,
  failStreak: number
): number {
  const base = Math.max(1_000, Math.floor(baseMs));
  if (failStreak <= 0) return base;
  const mult = Math.min(2 ** Math.min(failStreak, 4), 16);
  return Math.min(base * mult, VOCAB_TEACHER_QUIZ_LIVE_POLL_BACKOFF_CAP_MS);
}

/** live PUT 失败重试：连失败退避，勿固定 2.5s 打满 isolate */
export function vocabTeacherQuizLiveSyncRetryBackoffMs(
  failStreak: number
): number {
  return vocabTeacherQuizLivePollBackoffMs(
    VOCAB_TEACHER_QUIZ_LIVE_SYNC_RETRY_MS,
    failStreak
  );
}

export function abortSignalAfter(timeoutMs: number): AbortSignal {
  const AbortSignalCtor = AbortSignal as typeof AbortSignal & {
    timeout?: (ms: number) => AbortSignal;
  };
  if (typeof AbortSignalCtor.timeout === "function") {
    return AbortSignalCtor.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export async function putVocabTeacherQuizLiveWord(opts: {
  apiPath: string;
  wordId: number | null;
  locale: string;
  localeHeaderName: string;
}): Promise<boolean> {
  const res = await fetch(opts.apiPath, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      [opts.localeHeaderName]: opts.locale,
    },
    credentials: "include",
    body: JSON.stringify({ word_id: opts.wordId }),
    signal: abortSignalAfter(VOCAB_TEACHER_QUIZ_LIVE_SYNC_TIMEOUT_MS),
  });
  return res.ok;
}
