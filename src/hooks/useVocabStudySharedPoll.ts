"use client";

import { useEffect } from "react";
import { resolveVocabPollIntervalMs } from "@/lib/vocab-poll-throttle";
import { VOCAB_STUDY_SHARED_ERROR_BACKOFF_MS } from "@/lib/vocab-study-shared-fetch";

export type VocabStudySharedPollResult = {
  /** true：本次 shared 遇 503/网络失败，下一轮拉长间隔 */
  errorBackoff?: boolean;
};

type LoadShared = (
  opts?: { force?: boolean }
) => void | Promise<void | VocabStudySharedPollResult>;

/**
 * 学生「今日单词」跨设备同步：老师勾选熟悉程度写 shared 后，
 * BroadcastChannel 只通同浏览器；课堂必须靠轻量轮询拉列表并弹卡。
 * 遇 Worker 忙/1102 后自动拉长间隔，避免手机冷 isolate 叠打。
 */
export function useVocabStudySharedPoll(opts: {
  enabled: boolean;
  username?: string | null;
  loadShared: LoadShared;
  activeMs: number;
  hiddenMs: number;
}): void {
  const { enabled, username, loadShared, activeMs, hiddenMs } = opts;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let errorBackoffUntil = 0;

    const schedule = () => {
      if (cancelled) return;
      const base = resolveVocabPollIntervalMs({
        activeMs,
        hiddenMs,
        username,
      });
      const now = Date.now();
      const backoffLeft = Math.max(0, errorBackoffUntil - now);
      const delay = Math.max(base, backoffLeft);
      timer = setTimeout(() => {
        void Promise.resolve(loadShared({ force: true }))
          .then((result) => {
            if (result && result.errorBackoff) {
              errorBackoffUntil = Date.now() + VOCAB_STUDY_SHARED_ERROR_BACKOFF_MS;
            } else if (result && result.errorBackoff === false) {
              errorBackoffUntil = 0;
            }
          })
          .catch(() => {
            errorBackoffUntil = Date.now() + VOCAB_STUDY_SHARED_ERROR_BACKOFF_MS;
          })
          .finally(() => {
            if (!cancelled) schedule();
          });
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, username, loadShared, activeMs, hiddenMs]);
}
