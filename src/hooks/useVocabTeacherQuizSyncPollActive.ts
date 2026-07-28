"use client";

import { useEffect, useRef, useState } from "react";
import {
  isVocabTeacherQuizSyncIdle,
  maxSessionReviewAtMs,
  shouldEnableVocabTeacherQuizSyncPoll,
  vocabTeacherQuizLastActivityAtMs,
} from "@/lib/vocab-teacher-quiz-sync-poll";

/**
 * 老师端：未开抽查卡不轮询；卡打开才轮询；半小时无勾选则 idle（降频）；
 * 今日抽完后以最后勾选起算再留 30 分钟。管理员模式请传 enabled=false。
 */
export function useVocabTeacherQuizSyncPollActive(options: {
  enabled: boolean;
  showQuizFlashcard: boolean;
  quizComplete: boolean;
  sessionReviewAt: Record<number, number>;
}): { active: boolean; idle: boolean } {
  const { enabled, showQuizFlashcard, quizComplete, sessionReviewAt } = options;
  const [active, setActive] = useState(false);
  const [idle, setIdle] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const quizStartedAtMsRef = useRef<number | null>(null);
  const wasFlashcardOpenRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      quizStartedAtMsRef.current = null;
      wasFlashcardOpenRef.current = false;
      setActive(false);
      setIdle(false);
      return;
    }

    if (showQuizFlashcard && !wasFlashcardOpenRef.current) {
      quizStartedAtMsRef.current = Date.now();
    } else if (!showQuizFlashcard) {
      quizStartedAtMsRef.current = null;
    }
    wasFlashcardOpenRef.current = showQuizFlashcard;

    const lastQuizActionAtMs = maxSessionReviewAtMs(sessionReviewAt);
    const nextActive = shouldEnableVocabTeacherQuizSyncPoll({
      showQuizFlashcard,
      quizComplete,
      lastQuizActionAtMs,
      nowMs: clock,
    });
    const lastActivityAtMs = vocabTeacherQuizLastActivityAtMs({
      lastQuizActionAtMs,
      quizStartedAtMs: quizStartedAtMsRef.current,
    });
    // 仅在仍应轮询时标 idle（降频）；已停轮询则 idle=false
    const nextIdle =
      nextActive &&
      isVocabTeacherQuizSyncIdle({
        lastActivityAtMs,
        nowMs: clock,
      });

    setActive(nextActive);
    setIdle(nextIdle);
  }, [enabled, showQuizFlashcard, quizComplete, sessionReviewAt, clock]);

  if (!enabled) return { active: false, idle: false };
  return { active, idle };
}
