"use client";

import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { clearEnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz-storage";
import type { EnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz";
import type { EnVocabLevel } from "@/lib/types";

/** 在抽查 hook 就绪后写入 ref，供 sync / 管理员重置回调 */
export function useEnVocabBindRemoteResetSessionClear(
  onRemoteResetClearSessionRef: MutableRefObject<(() => void) | null>,
  options: {
    userId: number | null | undefined;
    setSessionLevel: Dispatch<
      SetStateAction<Record<number, EnVocabLevel | undefined>>
    >;
    setSessionUsageLevels: Dispatch<
      SetStateAction<Record<number, Array<EnVocabLevel | null | undefined>>>
    >;
    setSessionReviewAt: Dispatch<SetStateAction<Record<number, number>>>;
    setQuizSession: Dispatch<SetStateAction<EnVocabTeacherQuizSession | null>>;
    setShowQuizFlashcard: Dispatch<SetStateAction<boolean>>;
  }
) {
  const {
    userId,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    setQuizSession,
    setShowQuizFlashcard,
  } = options;

  useEffect(() => {
    onRemoteResetClearSessionRef.current = () => {
      setSessionLevel({});
      setSessionUsageLevels({});
      setSessionReviewAt({});
      setQuizSession(null);
      setShowQuizFlashcard(false);
      if (userId != null) clearEnVocabTeacherQuizSession(userId);
    };
  }, [
    onRemoteResetClearSessionRef,
    userId,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    setQuizSession,
    setShowQuizFlashcard,
  ]);
}
