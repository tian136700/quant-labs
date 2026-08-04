"use client";

import { useEffect, useRef, useState } from "react";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import { advanceJpVocabTeacherQuizNext } from "@/components/jp-vocab-teacher-quiz-flashcard/advanceTeacherQuizNext";

type Args = {
  session: JpVocabTeacherQuizSession;
  wordId: number;
  selected: boolean;
  isShared: boolean;
  saveBusy: boolean;
  isCoach: boolean;
  isStudy: boolean;
  previewMode: boolean;
  isSaving: boolean;
  canGoNext: boolean;
  sessionComplete: boolean;
  wordHasLevel: (wordId: number) => boolean;
  uncheckedCount: number;
  onNavigate: (index: number) => void;
  onComplete: () => void;
  onMarkCoached?: (wordId: number) => void;
  onEnsureSharedBeforeNext?: (wordId: number) => Promise<boolean>;
};

/**
 * 老师抽查「下一个」：先同步给学生（未同步过才发），完成后再跳词。
 */
export function useJpVocabTeacherQuizNextAdvance(args: Args) {
  const {
    session,
    wordId,
    selected,
    isShared,
    saveBusy,
    isCoach,
    isStudy,
    previewMode,
    isSaving,
    canGoNext,
    sessionComplete,
    wordHasLevel,
    uncheckedCount,
    onNavigate,
    onComplete,
    onMarkCoached,
    onEnsureSharedBeforeNext,
  } = args;

  const [nextBlockedHint, setNextBlockedHint] = useState(false);
  const [syncWaitHint, setSyncWaitHint] = useState(false);
  const [remainingUncheckedHint, setRemainingUncheckedHint] = useState(false);
  const nextAdvanceBusyRef = useRef(false);
  const pendingNextAfterIdleRef = useRef(false);

  useEffect(() => {
    setNextBlockedHint(false);
    setSyncWaitHint(false);
    nextAdvanceBusyRef.current = false;
    pendingNextAfterIdleRef.current = false;
  }, [wordId]);

  useEffect(() => {
    if (!saveBusy) setSyncWaitHint(false);
  }, [saveBusy]);

  const runAdvanceAfterShare = () => {
    if (sessionComplete) {
      onComplete();
      return;
    }
    advanceJpVocabTeacherQuizNext({
      session,
      wordHasLevel,
      uncheckedCount,
      onNavigate,
      onComplete,
      setRemainingUncheckedHint,
    });
  };

  const runShareThenAdvance = async () => {
    if (nextAdvanceBusyRef.current) return;
    nextAdvanceBusyRef.current = true;
    try {
      if (!isShared && onEnsureSharedBeforeNext) {
        const ok = await onEnsureSharedBeforeNext(wordId);
        if (!ok) return;
      }
      runAdvanceAfterShare();
    } finally {
      nextAdvanceBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (saveBusy) return;
    if (!pendingNextAfterIdleRef.current) return;
    if (!selected || previewMode || isCoach || isStudy) return;
    pendingNextAfterIdleRef.current = false;
    setSyncWaitHint(false);
    void runShareThenAdvance();
    // 仅在 saveBusy 落下后触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveBusy, selected, previewMode, isCoach, isStudy, wordId, isShared]);

  const tryGoNext = () => {
    if (previewMode || isStudy) {
      if (previewMode && canGoNext) {
        onNavigate(session.currentIndex + 1);
        return;
      }
      onComplete();
      return;
    }
    if (!isCoach && !selected) {
      setNextBlockedHint(true);
      return;
    }
    if (isCoach) {
      if (isSaving) return;
      onMarkCoached?.(wordId);
      if (canGoNext) {
        onNavigate(session.currentIndex + 1);
      } else {
        onComplete();
      }
      return;
    }
    if (saveBusy || nextAdvanceBusyRef.current) {
      pendingNextAfterIdleRef.current = true;
      setSyncWaitHint(true);
      return;
    }
    setSyncWaitHint(false);
    void runShareThenAdvance();
  };

  return {
    nextBlockedHint,
    syncWaitHint,
    remainingUncheckedHint,
    setNextBlockedHint,
    setSyncWaitHint,
    setRemainingUncheckedHint,
    tryGoNext,
  };
}
