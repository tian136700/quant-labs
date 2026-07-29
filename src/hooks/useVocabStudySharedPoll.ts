"use client";

import { useEffect } from "react";
import { resolveVocabPollIntervalMs } from "@/lib/vocab-poll-throttle";

type LoadShared = (opts?: { force?: boolean }) => void | Promise<void>;

/**
 * 学生「今日单词」跨设备同步：老师勾选熟悉程度写 shared 后，
 * BroadcastChannel 只通同浏览器；课堂必须靠轻量轮询拉列表并弹卡。
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

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void Promise.resolve(loadShared({ force: true })).finally(() => {
          if (!cancelled) schedule();
        });
      }, resolveVocabPollIntervalMs({
        activeMs,
        hiddenMs,
        username,
      }));
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, username, loadShared, activeMs, hiddenMs]);
}
