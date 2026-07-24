"use client";

import { useMemo } from "react";
import {
  computeEnVocabDailyQuizProgress,
  computeEnVocabTeacherPageQuizProgress,
  type EnVocabDailyQuizProgress,
} from "@/lib/en-vocab-daily-quiz-progress";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import { effectiveTodayCheckCount } from "@/lib/en-vocab-daily-check";
import { enVocabCheckedInRound } from "@/lib/en-vocab-page-helpers";
import { filterEnVocabWordsBySearch } from "@/lib/en-vocab-search";
import { sortEnVocabQuizTargetWordsByDailySeq } from "@/lib/en-vocab-teacher-quiz";
import {
  isEnVocabWordInTeacherVisiblePool,
  type EnVocabTeacherVisibleLimit,
} from "@/lib/en-vocab-teacher-visible";
import type { EnVocabLevel, EnVocabWord } from "@/lib/types";

/** 今日抽查池 + 管理员视角进度（抽查 hook 之前） */
export function useEnVocabQuizTargetPool(options: {
  displayedWords: EnVocabWord[];
  words: EnVocabWord[];
  teacherVisibleLimit: EnVocabTeacherVisibleLimit;
  dailySeqByWordId: Map<number, number>;
}) {
  const { displayedWords, words, teacherVisibleLimit, dailySeqByWordId } =
    options;

  const quizTarget = Math.min(
    Math.max(0, teacherVisibleLimit.quiz_target),
    Math.max(0, words.length)
  );

  const quizTargetWords = useMemo(() => {
    const pool = displayedWords.filter((w) =>
      isEnVocabWordInTeacherVisiblePool(
        w.id,
        teacherVisibleLimit,
        dailySeqByWordId
      )
    );
    return sortEnVocabQuizTargetWordsByDailySeq(pool, dailySeqByWordId);
  }, [displayedWords, dailySeqByWordId, teacherVisibleLimit]);

  const quizTargetWordIds = useMemo(
    () => new Set(quizTargetWords.map((w) => w.id)),
    [quizTargetWords]
  );

  const dailyQuizProgress = useMemo(
    () => computeEnVocabDailyQuizProgress(words, quizTarget),
    [words, quizTarget]
  );

  return {
    quizTarget,
    quizTargetWords,
    quizTargetWordIds,
    dailyQuizProgress,
  };
}

/** 老师端进度条 + 列表隐藏已抽完/进行中行（抽查 hook 之后） */
export function useEnVocabTeacherListView(options: {
  isAdminMode: boolean;
  canOperate: boolean;
  displayedWords: EnVocabWord[];
  quizTargetWords: EnVocabWord[];
  quizTargetWordIds: Set<number>;
  dailyQuizProgress: EnVocabDailyQuizProgress;
  quizWordHasLevel: (wordId: number) => boolean;
  sessionLevel: Record<number, EnVocabLevel | undefined>;
  displayOrder: EnVocabDailyDisplayOrder;
  searchQuery: string;
  kindFilter: "all" | "word" | "grammar";
}) {
  const {
    isAdminMode,
    canOperate,
    displayedWords,
    quizTargetWords,
    quizTargetWordIds,
    dailyQuizProgress,
    quizWordHasLevel,
    sessionLevel,
    displayOrder,
    searchQuery,
    kindFilter,
  } = options;

  const teacherPendingWords = useMemo(
    () =>
      displayedWords.filter(
        (w) =>
          quizTargetWordIds.has(w.id) &&
          (!quizWordHasLevel(w.id) || sessionLevel[w.id] != null)
      ),
    [displayedWords, quizTargetWordIds, quizWordHasLevel, sessionLevel]
  );

  const teacherPendingWordIds = useMemo(
    () => new Set(teacherPendingWords.map((w) => w.id)),
    [teacherPendingWords]
  );

  const displayQuizProgress = useMemo(() => {
    if (isAdminMode) return dailyQuizProgress;
    // 分母必须用整池 quizTargetWords，禁止用「仅剩未勾选」的 pending 列表
    const poolComplete =
      quizTargetWords.length > 0 &&
      quizTargetWords.every((w) => quizWordHasLevel(w.id));
    return computeEnVocabTeacherPageQuizProgress(
      quizTargetWords,
      quizWordHasLevel,
      {
        forceComplete: dailyQuizProgress.complete || poolComplete,
      }
    );
  }, [isAdminMode, dailyQuizProgress, quizTargetWords, quizWordHasLevel]);

  const searchActive = searchQuery.trim().length > 0;
  const filterActive = searchActive || kindFilter !== "all";
  const hideInoperableRows = canOperate && !isAdminMode;

  const searchMatchedWords = useMemo(
    () => filterEnVocabWordsBySearch(displayedWords, searchQuery, kindFilter),
    [displayedWords, searchQuery, kindFilter]
  );

  const isEnVocabWordCheckedToday = useMemo(() => {
    return (word: EnVocabWord, now = new Date()) => {
      if (
        effectiveTodayCheckCount(
          word.today_check_count ?? 0,
          word.today_check_date,
          now
        ) > 0
      ) {
        return true;
      }
      return enVocabCheckedInRound(displayOrder, word);
    };
  }, [displayOrder]);

  const filteredDisplayedWords = useMemo(() => {
    if (!hideInoperableRows) return searchMatchedWords;
    if (dailyQuizProgress.complete || displayQuizProgress.complete) {
      return searchMatchedWords.filter((w) => isEnVocabWordCheckedToday(w));
    }
    return searchMatchedWords.filter((w) => teacherPendingWordIds.has(w.id));
  }, [
    hideInoperableRows,
    searchMatchedWords,
    dailyQuizProgress.complete,
    displayQuizProgress.complete,
    teacherPendingWordIds,
    isEnVocabWordCheckedToday,
  ]);

  return {
    teacherPendingWords,
    teacherPendingWordIds,
    displayQuizProgress,
    searchActive,
    filterActive,
    hideInoperableRows,
    searchMatchedWords,
    isEnVocabWordCheckedToday,
    filteredDisplayedWords,
  };
}
