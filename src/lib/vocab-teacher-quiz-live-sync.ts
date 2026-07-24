/** 老师抽查 live 词同步 / 学生 peek：超时与重试（改前见 vocab-teacher-quiz-live-sync.mdc） */

/** 老师 PUT live：单次请求墙钟超时（避免一直挂起导致学生 peek 永远 no_active_word） */
export const VOCAB_TEACHER_QUIZ_LIVE_SYNC_TIMEOUT_MS = 12_000;

/** PUT 失败后重试间隔 */
export const VOCAB_TEACHER_QUIZ_LIVE_SYNC_RETRY_MS = 2_500;

/** 学生 POST peek：超时后提示重试，禁止无限转圈 */
export const VOCAB_STUDENT_PEEK_TIMEOUT_MS = 20_000;

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
