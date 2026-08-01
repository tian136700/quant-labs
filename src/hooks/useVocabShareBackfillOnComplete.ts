"use client";

import { useEffect, useRef } from "react";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";

/**
 * 把「已勾选熟悉程度但未共享」的池内词补同步给学生。
 *
 * - 抽查进行中：补发除当前卡片词以外的漏发（关卡未点「下一个」、点「上一个」离开等）
 * - 当前卡上的词仍等「下一个」再同步，避免学生提前看到
 * - 今日抽完后：连当前词一并补发
 */
export function useVocabShareBackfillOnComplete(opts: {
  enabled: boolean;
  complete: boolean;
  poolWordIds: readonly number[];
  hasLevel: (wordId: number) => boolean;
  isSharedToday: (wordId: number) => boolean;
  shareWord: (wordId: number) => Promise<boolean>;
  /** 抽查卡打开时当前词 id；进行中勿提前共享该词 */
  excludeWordId?: number | null;
}) {
  const {
    enabled,
    complete,
    poolWordIds,
    hasLevel,
    isSharedToday,
    shareWord,
    excludeWordId = null,
  } = opts;
  const attemptedKeyRef = useRef("");
  const missingIds =
    enabled
      ? poolWordIds.filter((id) => {
          if (!hasLevel(id) || isSharedToday(id)) return false;
          if (!complete && excludeWordId != null && id === excludeWordId) {
            return false;
          }
          return true;
        })
      : [];
  const missingKey = missingIds.slice().sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!enabled || !missingKey) return;
    const key = `${beijingDateString()}:${complete ? "done" : "mid"}:${missingKey}`;
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
