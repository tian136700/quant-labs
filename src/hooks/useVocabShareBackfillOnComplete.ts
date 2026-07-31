"use client";

import { useEffect, useRef } from "react";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";

/**
 * 老师今日抽查已完成后：把「已勾选但未共享」的池内词补同步给学生。
 * 常见漏发：关卡未点「下一个」、或旧版 1h 锁曾拦 share。
 */
export function useVocabShareBackfillOnComplete(opts: {
  enabled: boolean;
  complete: boolean;
  poolWordIds: readonly number[];
  hasLevel: (wordId: number) => boolean;
  isSharedToday: (wordId: number) => boolean;
  shareWord: (wordId: number) => Promise<boolean>;
}) {
  const { enabled, complete, poolWordIds, hasLevel, isSharedToday, shareWord } =
    opts;
  const attemptedKeyRef = useRef("");
  const missingIds = enabled && complete
    ? poolWordIds.filter((id) => hasLevel(id) && !isSharedToday(id))
    : [];
  const missingKey = missingIds.slice().sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!enabled || !complete || !missingKey) return;
    const key = `${beijingDateString()}:${missingKey}`;
    if (attemptedKeyRef.current === key) return;
    attemptedKeyRef.current = key;
    const ids = missingKey
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0);
    let cancelled = false;
    void (async () => {
      for (const id of ids) {
        if (cancelled) return;
        await shareWord(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, complete, missingKey, shareWord]);
}
