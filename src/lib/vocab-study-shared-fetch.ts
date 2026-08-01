/**
 * 今日单词 shared 拉列表：超时 + 忙时重试（防手机冷 isolate 1102 挂死数分钟）。
 * 见 `.cursor/rules/shared-list-no-notes-blob.mdc`
 */

import { abortSignalAfter } from "@/lib/vocab-teacher-quiz-live-sync";

/** 单次 shared 墙钟超时（与 peek 同档；禁止无限挂到浏览器自己断） */
export const VOCAB_STUDY_SHARED_FETCH_TIMEOUT_MS = 20_000;

/** 遇 500/503 / 超时 / 网络失败时的退避（共最多 1+N 次） */
export const VOCAB_STUDY_SHARED_RETRY_DELAYS_MS = [700, 1_500] as const;

/**
 * 连续 503/网络失败后，轮询拉长间隔，避免手机冷 isolate 上叠打 shared。
 * （正常课堂仍用 5s；失败后约 45s 再试。）
 */
export const VOCAB_STUDY_SHARED_ERROR_BACKOFF_MS = 45_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFetchError(err: unknown): boolean {
  if (err == null) return false;
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return err.name === "AbortError" || err.name === "TimeoutError";
  }
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    const msg = err.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("load failed") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed")
    );
  }
  return false;
}

/**
 * GET shared（含 ?lite=1）：每尝试带超时；5xx / 超时 / 网络失败则退避再试。
 * 最后一次仍 5xx 时返回该 Response，由调用方上报；网络错误耗尽则抛出。
 */
export async function fetchVocabStudySharedWithRetry(
  sharedUrl: string,
  init: Omit<RequestInit, "signal">
): Promise<{ res: Response; fetchStarted: number; attempts: number }> {
  const fetchStarted = Date.now();
  const maxAttempts = 1 + VOCAB_STUDY_SHARED_RETRY_DELAYS_MS.length;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(VOCAB_STUDY_SHARED_RETRY_DELAYS_MS[attempt - 1]!);
    }
    try {
      const res = await fetch(sharedUrl, {
        ...init,
        signal: abortSignalAfter(VOCAB_STUDY_SHARED_FETCH_TIMEOUT_MS),
      });
      const retryableStatus = res.status === 500 || res.status === 503;
      if (retryableStatus && attempt < maxAttempts - 1) {
        continue;
      }
      return { res, fetchStarted, attempts: attempt + 1 };
    } catch (err) {
      lastError = err;
      if (!isRetryableFetchError(err) || attempt >= maxAttempts - 1) {
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("shared fetch failed");
}
