"use client";

import { useEffect, useRef, useState } from "react";
import {
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";

/** 任意 D1 保存操作：active 为 true 时跑百分比，结束后补到 100% 再隐藏 */
export function useSaveProgressBar(active: boolean): {
  visible: boolean;
  percent: number;
} {
  const [percent, setPercent] = useState(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
  const [visible, setVisible] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current != null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    if (active) {
      setVisible(true);
      startedAtRef.current = Date.now();
      setPercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
      clearTimer();
      timerRef.current = setInterval(() => {
        if (startedAtRef.current != null) {
          setPercent(jpVocabSaveProgressPercent(Date.now() - startedAtRef.current));
        }
      }, 200);
    } else if (wasActiveRef.current && startedAtRef.current != null) {
      clearTimer();
      const startedAt = startedAtRef.current;
      startedAtRef.current = null;
      void animateJpVocabSaveProgressTo100(startedAt, setPercent).then(() => {
        setVisible(false);
        setPercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
      });
    }

    wasActiveRef.current = active;
    return clearTimer;
  }, [active]);

  return { visible, percent };
}
