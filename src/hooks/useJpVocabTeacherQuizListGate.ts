"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  computeJpVocabDailyQuizProgress,
  computeJpVocabTeacherPageQuizProgress,
} from "@/lib/jp-vocab-daily-quiz-progress";
import { resolveJpVocabTeacherQuizListVisibility } from "@/lib/jp-vocab-teacher-quiz-landing";
import { isJpVocabWordReviewLocked } from "@/lib/jp-vocab-review";
import { isJpVocabWordInTeacherVisiblePool } from "@/lib/jp-vocab-teacher-visible";
import type { JpVocabTeacherVisibleLimit } from "@/lib/jp-vocab-teacher-visible";
import type { JpVocabWord } from "@/lib/types";

type UseJpVocabTeacherQuizListGateArgs = {
  canOperate: boolean;
  isAdminMode: boolean;
  teacherQuizInProgress: boolean;
  showQuizFlashcard: boolean;
  quizTarget: number;
  reviewLockNow: number;
  displayedWords: JpVocabWord[];
  teacherVisibleLimit: JpVocabTeacherVisibleLimit;
  dailySeqByWordId: Map<number, number>;
  dailyQuizProgress: ReturnType<typeof computeJpVocabDailyQuizProgress>;
  quizWordHasLevel: (wordId: number) => boolean;
  sessionLevel: Record<number, unknown>;
  setTeacherQuizPollGate: (gate: {
    showQuizFlashcard: boolean;
    quizComplete: boolean;
  }) => void;
};

/**
 * 老师端：可见池判定、进度展示、开场/继续藏词表门闩。
 * 从 JpVocabPage 抽出以控行数；行为与英语开场藏表对齐。
 */
export function useJpVocabTeacherQuizListGate({
  canOperate,
  isAdminMode,
  teacherQuizInProgress,
  showQuizFlashcard,
  quizTarget,
  reviewLockNow,
  displayedWords,
  teacherVisibleLimit,
  dailySeqByWordId,
  dailyQuizProgress,
  quizWordHasLevel,
  sessionLevel,
  setTeacherQuizPollGate,
}: UseJpVocabTeacherQuizListGateArgs) {
  const isWordInQuizTarget = useCallback(
    (wordId: number) =>
      isJpVocabWordInTeacherVisiblePool(
        wordId,
        teacherVisibleLimit,
        dailySeqByWordId
      ),
    [teacherVisibleLimit, dailySeqByWordId]
  );

  const teacherPendingWords = useMemo(
    () =>
      displayedWords.filter(
        (w) =>
          isWordInQuizTarget(w.id) &&
          (!quizWordHasLevel(w.id) || sessionLevel[w.id] != null)
      ),
    [displayedWords, isWordInQuizTarget, quizWordHasLevel, sessionLevel]
  );

  const displayQuizProgress = useMemo(() => {
    if (isAdminMode) return dailyQuizProgress;
    return computeJpVocabTeacherPageQuizProgress(
      teacherPendingWords,
      quizWordHasLevel,
      {
        forceComplete:
          dailyQuizProgress.complete ||
          (quizTarget > 0 &&
            teacherPendingWords.length === 0 &&
            dailyQuizProgress.checked > 0),
      }
    );
  }, [
    isAdminMode,
    dailyQuizProgress,
    teacherPendingWords,
    quizWordHasLevel,
    quizTarget,
  ]);

  useEffect(() => {
    setTeacherQuizPollGate({
      showQuizFlashcard,
      quizComplete: displayQuizProgress.complete,
    });
  }, [showQuizFlashcard, displayQuizProgress.complete, setTeacherQuizPollGate]);

  const isWordReviewLocked = useCallback(
    (word: JpVocabWord, sessionReviewAtMs?: number) =>
      isJpVocabWordReviewLocked(word, {
        sessionReviewAtMs,
        now: new Date(reviewLockNow),
      }),
    [reviewLockNow]
  );

  const { hideTeacherQuizList, showTeacherQuizStartLanding } =
    resolveJpVocabTeacherQuizListVisibility({
      canOperate,
      isAdminMode,
      dailyQuizComplete: dailyQuizProgress.complete,
      displayQuizComplete: displayQuizProgress.complete,
      teacherQuizInProgress,
    });

  return {
    isWordInQuizTarget,
    isWordReviewLocked,
    teacherPendingWords,
    displayQuizProgress,
    hideTeacherQuizList,
    showTeacherQuizStartLanding,
  };
}
