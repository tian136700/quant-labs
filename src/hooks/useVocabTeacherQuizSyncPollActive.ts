"use client";

import { useEffect, useState } from "react";
import {
  maxSessionReviewAtMs,
  shouldEnableVocabTeacherQuizSyncPoll,
} from "@/lib/vocab-teacher-quiz-sync-poll";

/**
 * 老师端：未开抽查卡不轮询；卡打开才轮询；今日抽完后以最后勾选起算再留 30 分钟。
 * 管理员模式请传 enabled=false。
 */
export function useVocabTeacherQuizSyncPollActive(options: {
  enabled: boolean;
  showQuizFlashcard: boolean;
  quizComplete: boolean;
  sessionReviewAt: Record<number, number>;
}): boolean {
  const { enabled, showQuizFlashcard, quizComplete, sessionReviewAt } = options;
  const [active, setActive] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      return;
    }
    setActive(
      shouldEnableVocabTeacherQuizSyncPoll({
        showQuizFlashcard,
        quizComplete,
        lastQuizActionAtMs: maxSessionReviewAtMs(sessionReviewAt),
        nowMs: clock,
      })
    );
  }, [enabled, showQuizFlashcard, quizComplete, sessionReviewAt, clock]);

  return enabled ? active : false;
}
