"use client";

import { useEffect, useRef } from "react";
import {
  evaluateEnVocabDailyCompleteModal,
  shouldShowEnVocabTeacherDailyComplete,
  type EnVocabDailyCompleteSnapshot,
} from "@/lib/en-vocab-daily-complete-dismiss";
import type { EnVocabDailyQuizProgress } from "@/lib/en-vocab-daily-quiz-progress";

export function useEnVocabDailyCompleteEffects(options: {
  userId: number | undefined;
  isAdminMode: boolean;
  canOperate: boolean;
  loading: boolean;
  checking: boolean;
  wordsLength: number;
  dailyQuizProgress: EnVocabDailyQuizProgress;
  setShowDailyComplete: (open: boolean) => void;
}) {
  const {
    userId,
    isAdminMode,
    canOperate,
    loading,
    checking,
    wordsLength,
    dailyQuizProgress,
    setShowDailyComplete,
  } = options;

  const dailyCompleteSnapshotRef = useRef<EnVocabDailyCompleteSnapshot | null>(
    null
  );

  useEffect(() => {
    if (isAdminMode || !canOperate || !userId || dailyQuizProgress.total <= 0) {
      return;
    }

    const { nextSnapshot, open } = evaluateEnVocabDailyCompleteModal({
      ready: !loading && !checking && wordsLength > 0,
      userId,
      progress: dailyQuizProgress,
      prevSnapshot: dailyCompleteSnapshotRef.current,
    });
    dailyCompleteSnapshotRef.current = nextSnapshot;
    if (open) setShowDailyComplete(true);
  }, [
    loading,
    checking,
    canOperate,
    isAdminMode,
    userId,
    wordsLength,
    dailyQuizProgress.complete,
    dailyQuizProgress.total,
    setShowDailyComplete,
  ]);

  return {
    onTeacherQuizSessionFinished: () => {
      if (!userId || isAdminMode) return;
      dailyCompleteSnapshotRef.current = {
        complete: dailyQuizProgress.complete,
        total: dailyQuizProgress.total,
      };
      if (shouldShowEnVocabTeacherDailyComplete(userId, dailyQuizProgress.total)) {
        setShowDailyComplete(true);
      }
    },
  };
}
