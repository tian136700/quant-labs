"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import type { Locale } from "@/i18n/messages";
import {
  buildJpVocabCoachExportItems,
  postJpVocabCoachMerge,
} from "@/lib/jp-vocab-coach";
import {
  evaluateJpVocabDailyCompleteModal,
  shouldShowJpVocabTeacherDailyComplete,
  type JpVocabDailyCompleteSnapshot,
} from "@/lib/jp-vocab-daily-complete-dismiss";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

export function useJpVocabDailyCompleteEffects(options: {
  locale: Locale;
  userId: number | undefined;
  isAdminMode: boolean;
  canOperate: boolean;
  loading: boolean;
  checking: boolean;
  wordsLength: number;
  showDailyComplete: boolean;
  dailyQuizProgress: JpVocabDailyQuizProgress;
  sessionLevelRef: MutableRefObject<Record<number, JpVocabLevel | undefined>>;
  wordsRef: MutableRefObject<JpVocabWord[]>;
  displayOrderRef: MutableRefObject<JpVocabDailyDisplayOrder>;
  setShowDailyComplete: (open: boolean) => void;
  setStatus: (message: string) => void;
  setError: (message: string) => void;
}) {
  const {
    locale,
    userId,
    isAdminMode,
    canOperate,
    loading,
    checking,
    wordsLength,
    showDailyComplete,
    dailyQuizProgress,
    sessionLevelRef,
    wordsRef,
    displayOrderRef,
    setShowDailyComplete,
    setStatus,
    setError,
  } = options;

  const dailyCompleteSnapshotRef = useRef<JpVocabDailyCompleteSnapshot | null>(null);
  const coachMergedOnCompleteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isAdminMode || !canOperate || !userId || dailyQuizProgress.total <= 0) return;

    const { nextSnapshot, open } = evaluateJpVocabDailyCompleteModal({
      ready: !loading && !checking && wordsLength > 0,
      userId,
      progress: dailyQuizProgress,
      prevSnapshot: dailyCompleteSnapshotRef.current,
      shouldShow: shouldShowJpVocabTeacherDailyComplete,
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

  useEffect(() => {
    if (!showDailyComplete || isAdminMode || !canOperate || !userId) return;

    const items = buildJpVocabCoachExportItems(
      wordsRef.current,
      sessionLevelRef.current,
      displayOrderRef.current
    );
    const key = `${beijingDateString()}:${userId}:${dailyQuizProgress.total}:${items
      .map((item) => `${item.word_id}:${item.level}`)
      .join(",")}`;
    if (coachMergedOnCompleteKeyRef.current === key) return;
    coachMergedOnCompleteKeyRef.current = key;
    if (!items.length) return;

    let cancelled = false;
    void (async () => {
      try {
        const result = await postJpVocabCoachMerge(locale, items);
        if (cancelled) return;
        setStatus(
          `今日未掌握已写入课堂带读：未带读 ${result.pending_count} 条（新增 ${result.added_count}）。`
        );
      } catch (err) {
        if (cancelled) return;
        coachMergedOnCompleteKeyRef.current = null;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    showDailyComplete,
    isAdminMode,
    canOperate,
    userId,
    dailyQuizProgress.total,
    locale,
    displayOrderRef,
    wordsRef,
    sessionLevelRef,
    setStatus,
    setError,
  ]);

  return {
    onTeacherQuizSessionFinished: () => {
      if (!userId || isAdminMode) return;
      dailyCompleteSnapshotRef.current = {
        complete: dailyQuizProgress.complete,
        total: dailyQuizProgress.total,
      };
      if (shouldShowJpVocabTeacherDailyComplete(userId, dailyQuizProgress.total)) {
        setShowDailyComplete(true);
      }
    },
  };
}
