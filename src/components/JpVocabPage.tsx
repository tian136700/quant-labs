"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  jpVocabPriorityLabel,
  jpVocabTotalReviews,
  sortJpVocabWordsForDisplay,
  type JpVocabStatSortKey,
} from "@/lib/jp-vocab-shared";
import {
  buildJpVocabDailySeqMap,
  isJpVocabRoundChecked,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";
import {
  filterJpVocabWordsBySearch,
  type JpVocabKindFilter,
} from "@/lib/jp-vocab-search";
import { copyTextToClipboard } from "@/lib/copy-text";
import { jpVocabFlashcardCopyText } from "@/lib/jp-vocab-flashcard-copy";
import { JpVocabEditModal } from "@/components/JpVocabEditModal";
import { JpClassNotesEditModal } from "@/components/JpClassNotesEditModal";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabMnemonicViewModal } from "@/components/JpVocabMnemonicViewModal";
import { JpVocabRemarksViewModal } from "@/components/JpVocabRemarksViewModal";
import { MobileScrollToTopButton } from "@/components/MobileScrollToTopButton";
import { JpVocabManualAddModal } from "@/components/JpVocabManualAddModal";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import {
  JpVocabDailyQuizIntroModal,
  shouldShowJpVocabDailyIntro,
} from "@/components/JpVocabDailyQuizIntroModal";
import { JpVocabDailyQuizProgressBar } from "@/components/JpVocabDailyQuizProgressBar";
import { JpVocabQuizTimeWeightAdmin } from "@/components/JpVocabQuizTimeWeightAdmin";
import { JpVocabDailyQuizCompleteModal } from "@/components/JpVocabDailyQuizCompleteModal";
import { JpVocabShareRequestModal } from "@/components/JpVocabShareRequestModal";
import { JpVocabResetChoiceModal } from "@/components/JpVocabResetChoiceModal";
import { JpVocabTeacherQuizIntroModal } from "@/components/JpVocabTeacherQuizIntroModal";
import { JpVocabTeacherQuizFlashcardModal } from "@/components/JpVocabTeacherQuizFlashcardModal";
import { JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT } from "@/lib/jp-vocab-daily-quiz-style";
import {
  filterJpVocabTodayWeakWords,
  resolveJpVocabExportWords,
  type JpVocabExportScope,
} from "@/lib/jp-vocab-export";
import {
  buildJpVocabCoachExportItems,
  countJpVocabCoachLevelCounts,
  postJpVocabCoachMerge,
} from "@/lib/jp-vocab-coach";
import { jpVocabAdminPath, jpVocabCoachPath, jpVocabPath, jpVocabStudyPath } from "@/lib/locale-path";
import {
  jpVocabTodayCheckStats,
  beijingDateString,
} from "@/lib/jp-vocab-daily-check";
import {
  effectiveJpVocabDisplayLevel,
  isJpVocabWordReviewLocked,
} from "@/lib/jp-vocab-review";
import {
  isJpVocabWordInTeacherVisiblePool,
  isJpVocabWordQuizCheckedToday,
  listJpVocabTeacherQuizPoolWords,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import { JpVocabRefPreviewModal } from "@/components/JpVocabRefPreviewModal";
import { resolveJpVocabRefForPreview } from "@/lib/jp-vocab-ref-shared";
import {
  computeJpVocabDailyQuizProgress,
  computeJpVocabTeacherPageQuizProgress,
} from "@/lib/jp-vocab-daily-quiz-progress";
import {
  evaluateJpVocabDailyCompleteModal,
  markJpVocabTeacherDailyCompleteDismissed,
  shouldShowJpVocabTeacherDailyComplete,
  type JpVocabDailyCompleteSnapshot,
} from "@/lib/jp-vocab-daily-complete-dismiss";
import {
  JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED,
  JP_VOCAB_TEACHER_SHARE_ENABLED,
} from "@/lib/jp-vocab-share-ui";
import {
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
} from "@/lib/jp-vocab-save-progress";
import { JpVocabPagination } from "@/components/jp-vocab-page/JpVocabPagination";
import { JpVocabPageStyles } from "@/components/jp-vocab-page/JpVocabPageStyles";
import { JpVocabWordTable } from "@/components/jp-vocab-page/JpVocabWordTable";
import { useJpVocabPageSync } from "@/hooks/useJpVocabPageSync";
import { useJpVocabReviewActions } from "@/hooks/useJpVocabReviewActions";
import { useJpVocabTeacherQuiz } from "@/hooks/useJpVocabTeacherQuiz";
import { useJpVocabShareRequests } from "@/hooks/useJpVocabShareRequests";
import { useJpVocabAdminActions } from "@/hooks/useJpVocabAdminActions";
import {
  SHOW_RANDOM_HIGHLIGHT,
  SHOW_RISK_CHART,
} from "@/lib/jp-vocab-page-constants";
import {
  jpVocabWordsInOrder,
  pickRandomJpVocabWord,
  readStoredJpVocabPage,
  readStoredJpVocabPageSize,
  writeStoredJpVocabPage,
  writeStoredJpVocabPageSize,
} from "@/lib/jp-vocab-page-helpers";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

const JpVocabRiskChartModal = dynamic(
  () => import("@/components/JpVocabRiskChartModal").then((m) => m.JpVocabRiskChartModal),
  { ssr: false }
);
const JpVocabExportChoiceModal = dynamic(
  () => import("@/components/JpVocabExportChoiceModal").then((m) => m.JpVocabExportChoiceModal),
  { ssr: false }
);

type JpVocabPageVariant = "teacher" | "admin";

type JpVocabPageProps = {
  variant: JpVocabPageVariant;
};

export function JpVocabPage({ variant }: JpVocabPageProps) {
  const { locale } = useI18n();
  const router = useRouter();
  const {
    user,
    checking,
    canAccessJpVocab,
    canAccessJpVocabTeacherPage,
    canAccessJpVocabAdminPage,
    canAccessJpVocabStudy,
    canAccessJpVocabCoach,
    refresh,
    openAuthPanel,
    setUser,
    isAdmin,
    hasPermission,
  } = useEtrAuth();
  /** 产品模式：由路由 variant 驱动，不再用 isAdmin 兼做老师/管理员 UX */
  const isAdminMode = variant === "admin";
  const isTeacherMode = variant === "teacher";
  const canOperate = canAccessJpVocab;
  const canManualAdd = hasPermission("jp_vocab:manual_add");
  const canShareToStudy = canAccessJpVocab;
  const teacherShareUiEnabled =
    JP_VOCAB_TEACHER_SHARE_ENABLED && isTeacherMode && canShareToStudy;
  /** 有带读权限才在抽完后显示「进入今日带读」；无权限不露按钮、导航也不露课堂带读 */
  const showTeacherCoachEntry = isTeacherMode && canAccessJpVocabCoach;

  const openJpAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 日语单词",
      subtitle: "登录用户方可修改数据。",
    });
  }, [openAuthPanel]);

  useEffect(() => {
    if (checking || !user) return;
    if (variant === "teacher" && isAdmin) {
      router.replace(jpVocabAdminPath());
      return;
    }
    if (variant === "admin" && !canAccessJpVocabAdminPage) {
      router.replace(canAccessJpVocabTeacherPage ? jpVocabPath() : jpVocabStudyPath());
    }
  }, [
    checking,
    user,
    variant,
    isAdmin,
    canAccessJpVocabAdminPage,
    canAccessJpVocabTeacherPage,
    router,
  ]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  /** 本轮复习：每词当前勾选（仅前端，重置后清空） */
  const [sessionLevel, setSessionLevel] = useState<
    Record<number, JpVocabLevel | undefined>
  >({});
  /** 本轮每词最近一次勾选时间（毫秒，用于今日内改选修正） */
  const [sessionReviewAt, setSessionReviewAt] = useState<Record<number, number>>({});
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [editingWord, setEditingWord] = useState<JpVocabWord | null>(null);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<JpVocabWord | null>(null);
  const [viewingMnemonicWord, setViewingMnemonicWord] = useState<JpVocabWord | null>(null);
  const [previewRef, setPreviewRef] = useState<{
    ref: JpVocabRef;
    cacheVersion?: string | null;
  } | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<JpVocabWord | null>(null);
  const openRemarksWord = useCallback(
    (word: JpVocabWord) => {
      if (canOperate) {
        setEditingRemarksWord(word);
      } else {
        setViewingRemarksWord(word);
      }
    },
    [canOperate]
  );
  const showReadingCopyToast = useCallback(
    (readingTrim: string, wordTrim: string) => {
      const text = jpVocabFlashcardCopyText(readingTrim, wordTrim);
      if (!text) return;
      void copyTextToClipboard(text).then((ok) =>
        setCopyToast(
          ok
            ? locale === "zh"
              ? "复制成功"
              : "Copied"
            : locale === "zh"
              ? "复制失败"
              : "Copy failed"
        )
      );
    },
    [locale]
  );
  const [statSort, setStatSort] = useState<{
    key: JpVocabStatSortKey;
    dir: "asc" | "desc";
  }>(() => JP_VOCAB_DEFAULT_STAT_SORT);
  /** 未手动点列头排序时，行顺序用当日固定 display_order；点过后按列头数值排序 */
  const [useDailyRowOrder, setUseDailyRowOrder] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<JpVocabKindFilter>("all");
  const [page, setPage] = useState(() => readStoredJpVocabPage());
  const [pageSize, setPageSize] = useState(() => readStoredJpVocabPageSize());
  const [exporting, setExporting] = useState(false);
  const [showExportChoice, setShowExportChoice] = useState(false);
  const [showRiskChart, setShowRiskChart] = useState(false);
  const [showDailyIntro, setShowDailyIntro] = useState(false);
  const [showDailyComplete, setShowDailyComplete] = useState(false);
  const dailyCompleteSnapshotRef = useRef<JpVocabDailyCompleteSnapshot | null>(null);
  /** 抽查完成弹窗弹出时已批量写入带读的 key，避免重复打 D1 */
  const coachMergedOnCompleteKeyRef = useRef<string | null>(null);
  const [showVocabHelp, setShowVocabHelp] = useState(false);
  /** 手机端默认收起操作按钮，避免误触导出等 */
  const [mobileToolbarExpanded, setMobileToolbarExpanded] = useState(false);
  const [reviewLockNow, setReviewLockNow] = useState(() => Date.now());
  const sessionLevelRef = useRef(sessionLevel);
  const editingRemarksIdRef = useRef<number | null>(null);
  const sharedTodayWordIdsRef = useRef<Set<number>>(new Set());
  /** 老师（非管理员）今日抽查已全部完成 → 轮询大幅降频，减轻 Worker 压力 */
  const teacherIdleCompleteRef = useRef(false);
  const scrollToHighlightRef = useRef(false);

  const onDayRolloverClearSession = useCallback(() => {
    setSessionLevel({});
    setSessionReviewAt({});
    setHighlightId(null);
  }, []);

  const onLoadError = useCallback((message: string) => {
    setError(message);
  }, []);

  const {
    words,
    setWords,
    refs,
    setRefs,
    loading,
    refreshing,
    displayOrder,
    setDisplayOrder,
    sharedTodayWordIds,
    setSharedTodayWordIds,
    teacherVisibleLimit,
    setTeacherVisibleLimit,
    quizTimeWeight,
    setQuizTimeWeight,
    quizPriorityBoost,
    setQuizPriorityBoost,
    displayOrderRef,
    wordsRef,
    refsRef,
    persistCache,
  } = useJpVocabPageSync({
    checking,
    user,
    editingRemarksWordId: editingRemarksWord?.id ?? null,
    editingWordId: editingWord?.id ?? null,
    teacherIdleCompleteRef,
    setViewingRemarksWord,
    onLoadError,
    onDayRolloverClearSession,
  });

  const {
    shareRequests,
    showShareRequestModal,
    dismissShareRequests,
  } = useJpVocabShareRequests({
    canOperate,
    teacherIdleCompleteRef,
    setStatus,
  });

  useEffect(() => {
    sessionLevelRef.current = sessionLevel;
  }, [sessionLevel]);
  useEffect(() => {
    editingRemarksIdRef.current = editingRemarksWord?.id ?? null;
  }, [editingRemarksWord?.id]);
  useEffect(() => {
    sharedTodayWordIdsRef.current = sharedTodayWordIds;
  }, [sharedTodayWordIds]);

  useEffect(() => {
    const timer = setInterval(() => setReviewLockNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const toggleStatSort = (key: JpVocabStatSortKey) => {
    setUseDailyRowOrder(false);
    setPage(1);
    setStatSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      return { key, dir: "desc" };
    });
  };

  const restoreDailyRowOrder = () => {
    setUseDailyRowOrder(true);
    setStatSort(JP_VOCAB_DEFAULT_STAT_SORT);
    setPage(1);
  };

  const displayedWords = useMemo(() => {
    if (statSort.key === "seq" && displayOrder.ids.length > 0) {
      const ordered = jpVocabWordsInOrder(words, displayOrder.ids);
      return statSort.dir === "desc" ? [...ordered].reverse() : ordered;
    }
    if (useDailyRowOrder && displayOrder.ids.length > 0) {
      return jpVocabWordsInOrder(words, displayOrder.ids);
    }
    return sortJpVocabWordsForDisplay(words, statSort, {
      timeWeight: quizTimeWeight,
    });
  }, [words, statSort, displayOrder.ids, useDailyRowOrder, quizTimeWeight]);

  /** 当日固定序号：来自服务端 display_order，不随列头排序变化 */
  const dailySeqByWordId = useMemo(
    () => buildJpVocabDailySeqMap(displayOrder.ids),
    [displayOrder.ids]
  );

  const quizTarget = teacherVisibleLimit.quiz_target;

  /** 老师抽查池 = 服务端 visible_ids（从未抽查优先），勿再用「序号 1–N」代替 */
  const quizTargetWords = useMemo(
    () =>
      listJpVocabTeacherQuizPoolWords(
        displayedWords,
        displayOrder,
        teacherVisibleLimit,
        dailySeqByWordId
      ),
    [displayedWords, displayOrder, teacherVisibleLimit, dailySeqByWordId]
  );

  const quizTargetWordIds = useMemo(
    () => new Set(quizTargetWords.map((w) => w.id)),
    [quizTargetWords]
  );

  const dailyQuizProgress = useMemo(
    () => computeJpVocabDailyQuizProgress(words, teacherVisibleLimit),
    [words, teacherVisibleLimit.quiz_target]
  );

  const onTeacherQuizSessionFinished = useCallback(() => {
    if (!user || isAdminMode) return;
    dailyCompleteSnapshotRef.current = {
      complete: dailyQuizProgress.complete,
      total: dailyQuizProgress.total,
    };
    if (shouldShowJpVocabTeacherDailyComplete(user.id, dailyQuizProgress.total)) {
      setShowDailyComplete(true);
    }
  }, [user, isAdminMode, dailyQuizProgress.complete, dailyQuizProgress.total]);

  const {
    quizSession,
    setQuizSession,
    showQuizFlashcard,
    setShowQuizFlashcard,
    studentPeekedCurrentWord,
    showTeacherQuizIntro,
    handleTeacherQuizIntroConfirm,
    handleTeacherQuizIntroClose,
    quizCardPreviewWordId,
    setQuizCardPreviewWordId,
    quizCardPreviewSession,
    closeQuizCardPreview,
    quizWordHasLevel,
    startTeacherQuizWithRandomMode,
    resumeTeacherQuizFlashcard,
    finishTeacherQuiz,
    teacherQuizLocksTable,
    teacherQuizInProgress,
    quizFlashcardWordId,
    wordsById,
  } = useJpVocabTeacherQuiz({
    locale,
    user,
    checking,
    loading,
    canOperate,
    isAdminMode,
    words,
    sessionLevel,
    sessionReviewAt,
    displayOrder,
    quizTarget,
    quizTargetWords,
    quizTargetWordIds,
    dailySeqByWordId,
    setStatus,
    onTeacherQuizSessionFinished,
  });

  const isWordInQuizTarget = useCallback(
    (wordId: number) =>
      isJpVocabWordInTeacherVisiblePool(
        wordId,
        teacherVisibleLimit,
        dailySeqByWordId
      ),
    [teacherVisibleLimit, dailySeqByWordId]
  );

  const isWordReviewLocked = useCallback(
    (word: JpVocabWord, sessionReviewAtMs?: number) =>
      isJpVocabWordReviewLocked(word, {
        sessionReviewAtMs,
        now: new Date(reviewLockNow),
      }),
    [reviewLockNow]
  );

  /**
   * 老师「待抽查」词池：今日可见抽查池内尚未勾选熟悉程度的词；
   * 本会话刚勾选的仍保留（可改选、进度分子可涨）。
   * 不按 1 小时锁定统计——已勾过的（别人的或更早的）一律不进列表、不进总分。
   */
  const teacherPendingWords = useMemo(
    () =>
      displayedWords.filter(
        (w) =>
          isWordInQuizTarget(w.id) &&
          (!quizWordHasLevel(w.id) || sessionLevel[w.id] != null)
      ),
    [displayedWords, isWordInQuizTarget, quizWordHasLevel, sessionLevel]
  );

  const teacherPendingWordIds = useMemo(
    () => new Set(teacherPendingWords.map((w) => w.id)),
    [teacherPendingWords]
  );

  /** 老师看待抽查进度（分母=待抽查数）；管理员仍看全天目标进度 */
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

  /**
   * 老师抽查进行中：不展示单词列表，避免在列表里随意点选。
   * 今日/本轮已抽完时必须放开列表（展示已抽查词条），不能再藏表。
   */
  const hideTeacherQuizList =
    canOperate &&
    !isAdminMode &&
    teacherQuizInProgress &&
    !dailyQuizProgress.complete &&
    !displayQuizProgress.complete;

  /**
   * 今日/本轮进度已完成后立即关卡片、清会话，回到已抽完列表。
   * 禁止仅因「会话内词都勾了」就关卡：进度仍有剩余时说明可见池里还有未进会话的词，
   * 交给 expand effect / finishTeacherQuiz 补进队列。
   */
  useEffect(() => {
    if (!canOperate || isAdminMode || !quizSession) return;
    if (!dailyQuizProgress.complete && !displayQuizProgress.complete) {
      return;
    }
    setShowQuizFlashcard(false);
    setQuizSession(null);
  }, [
    canOperate,
    isAdminMode,
    quizSession,
    dailyQuizProgress.complete,
    displayQuizProgress.complete,
    setShowQuizFlashcard,
    setQuizSession,
  ]);

  const {
    wordSyncState,
    shareProgressMap,
    saveQueuePending,
    reviewLockedByWordId,
    recordLevel,
    tryRecordLevel,
    shareWord,
    unshareWord,
    quizFlashcardSavingWordId,
  } = useJpVocabReviewActions({
    locale,
    canOperate,
    canShareToStudy,
    isAdminMode,
    quizTarget,
    isWordInQuizTarget,
    isWordReviewLocked,
    quizSession,
    resumeTeacherQuizFlashcard,
    startTeacherQuizWithRandomMode,
    studentPeekedCurrentWord,
    words,
    refs,
    sessionLevel,
    sessionReviewAt,
    sharedTodayWordIds,
    displayOrderRef,
    wordsRef,
    refsRef,
    sharedTodayWordIdsRef,
    setWords,
    setDisplayOrder,
    setSessionLevel,
    setSessionReviewAt,
    setSharedTodayWordIds,
    setHighlightId,
    setStatus,
    openJpAuth,
    refresh,
    persistCache,
  });

  const {
    resetting,
    showResetChoice,
    setShowResetChoice,
    deletingId,
    boostingWordId,
    quizTargetInput,
    setQuizTargetInput,
    settingQuizTarget,
    settingQuizTimeWeight,
    boostQuizPriority,
    deleteWord,
    openResetChoice,
    resetToday,
    resetAll,
    setDailyQuizTarget,
    setQuizTimeWeightConfig,
  } = useJpVocabAdminActions({
    locale,
    isAdminMode,
    isAdmin,
    canOperate,
    openJpAuth,
    setStatus,
    setError,
    words,
    refs,
    sharedTodayWordIds,
    teacherVisibleLimit,
    highlightId,
    wordSyncState,
    sharedTodayWordIdsRef,
    refsRef,
    setWords,
    setDisplayOrder,
    setSharedTodayWordIds,
    setTeacherVisibleLimit,
    setQuizPriorityBoost,
    setQuizTimeWeight,
    setSessionLevel,
    setSessionReviewAt,
    setHighlightId,
    setUseDailyRowOrder,
    setStatSort,
    setPage,
    persistCache,
  });

  const searchActive = searchQuery.trim().length > 0;
  /** 老师端隐藏不可操作行（进行中：仅见待抽查；已完成：展示今日已抽查列表） */
  const hideInoperableRows = canOperate && !isAdminMode;

  const searchMatchedWords = useMemo(
    () => filterJpVocabWordsBySearch(displayedWords, searchQuery, kindFilter),
    [displayedWords, searchQuery, kindFilter]
  );

  const filteredDisplayedWords = useMemo(() => {
    if (!hideInoperableRows) return searchMatchedWords;
    const now = new Date(reviewLockNow);
    // 今日目标已满，或老师端本轮待抽池已空：展示今日已抽查列表（而非空的「进行中」池）
    if (dailyQuizProgress.complete || displayQuizProgress.complete) {
      return searchMatchedWords.filter((w) =>
        isJpVocabWordQuizCheckedToday(w, displayOrder, now)
      );
    }
    return searchMatchedWords.filter((w) => teacherPendingWordIds.has(w.id));
  }, [
    hideInoperableRows,
    searchMatchedWords,
    dailyQuizProgress.complete,
    displayQuizProgress.complete,
    displayOrder,
    reviewLockNow,
    teacherPendingWordIds,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredDisplayedWords.length / pageSize)
  );
  const safePage = Math.min(page, totalPages);
  const pagedDisplayedWords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredDisplayedWords.slice(start, start + pageSize);
  }, [filteredDisplayedWords, safePage, pageSize]);
  const pageRangeStart =
    filteredDisplayedWords.length === 0
      ? 0
      : (safePage - 1) * pageSize + 1;
  const pageRangeEnd = Math.min(
    safePage * pageSize,
    filteredDisplayedWords.length
  );

  useEffect(() => {
    if (loading) return;
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, loading]);

  useEffect(() => {
    writeStoredJpVocabPage(safePage);
  }, [safePage]);

  useEffect(() => {
    writeStoredJpVocabPageSize(pageSize);
  }, [pageSize]);

  const handlePageSizeChange = (nextSize: number) => {
    if (nextSize === pageSize) return;
    const firstIndex = (safePage - 1) * pageSize;
    setPageSize(nextSize);
    setPage(Math.floor(firstIndex / nextSize) + 1);
  };

  useEffect(() => {
    if (!scrollToHighlightRef.current || highlightId == null) return;
    scrollToHighlightRef.current = false;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`jp-vocab-row-${highlightId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightId, safePage]);

  const filterActive = searchActive || kindFilter !== "all";

  const dailyTarget = quizTarget;

  useEffect(() => {
    teacherIdleCompleteRef.current =
      canOperate && !isAdminMode && dailyQuizProgress.complete;
  }, [canOperate, isAdminMode, dailyQuizProgress.complete]);

  const dailyCheckedCount = dailyQuizProgress.checked;

  const anyCheckedInRound = useMemo(
    () => (displayOrder.round_checked_ids ?? []).length > 0,
    [displayOrder.round_checked_ids]
  );

  useEffect(() => {
    // 引导 / 抽完祝贺仅老师端；管理员端是全库与设目标，勿弹出
    if (loading || checking || !canOperate || isAdminMode || !words.length || !user)
      return;
    if (anyCheckedInRound) return;
    if (!shouldShowJpVocabDailyIntro(user.id)) return;
    setShowDailyIntro(true);
  }, [
    loading,
    checking,
    canOperate,
    isAdminMode,
    words.length,
    anyCheckedInRound,
    user?.id,
  ]);

  useEffect(() => {
    if (isAdminMode || !canOperate || !user || dailyQuizProgress.total <= 0) return;

    const { nextSnapshot, open } = evaluateJpVocabDailyCompleteModal({
      ready: !loading && !checking && words.length > 0,
      userId: user.id,
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
    user?.id,
    words.length,
    dailyQuizProgress.complete,
    dailyQuizProgress.total,
  ]);

  /**
   * 今日抽查完成弹窗出现时：一次性批量写入「一般 / 不熟悉」到课堂带读。
   * 不在勾选时单条写（免费 Worker/D1 易炸）；也不等点「进入课堂带读」。
   */
  useEffect(() => {
    if (!showDailyComplete || isAdminMode || !canOperate || !user) return;

    const items = buildJpVocabCoachExportItems(
      wordsRef.current,
      sessionLevelRef.current,
      displayOrderRef.current
    );
    const key = `${beijingDateString()}:${user.id}:${dailyQuizProgress.total}:${items
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
    user?.id,
    dailyQuizProgress.total,
    locale,
  ]);

  const unmarkedCount = useMemo(
    () =>
      quizTargetWords.filter(
        (w) =>
          !effectiveJpVocabDisplayLevel(w, sessionLevel[w.id], { displayOrder })
      ).length,
    [quizTargetWords, sessionLevel, displayOrder]
  );

  /** 复习合计为 0：历史上从未勾选过熟悉程度（仅管理员端工具栏展示） */
  const neverQuizzedCount = useMemo(
    () =>
      isAdminMode
        ? words.filter((w) => jpVocabTotalReviews(w) === 0).length
        : 0,
    [isAdminMode, words]
  );

  const hasAnyQuizLevelToday = useMemo(
    () =>
      quizTargetWords.some(
        (w) =>
          effectiveJpVocabDisplayLevel(w, sessionLevel[w.id], { displayOrder }) !=
          null
      ),
    [quizTargetWords, sessionLevel, displayOrder]
  );

  const todayWeakExportWords = useMemo(
    () => filterJpVocabTodayWeakWords(words, sessionLevel, displayOrder),
    [words, sessionLevel, displayOrder]
  );

  const dailyCoachLevelCounts = useMemo(
    () => countJpVocabCoachLevelCounts(quizTargetWords, sessionLevel, displayOrder),
    [quizTargetWords, sessionLevel, displayOrder]
  );


  const todayCheckStats = useMemo(
    () => jpVocabTodayCheckStats(words),
    [words]
  );

  const pickNext = () => {
    const pool = quizTargetWords.filter(
      (w) => !isWordReviewLocked(w, sessionReviewAt[w.id])
    );
    const next = pickRandomJpVocabWord(pool, highlightId ?? undefined);
    if (!next) return;
    const idx = filteredDisplayedWords.findIndex((w) => w.id === next.id);
    if (idx >= 0) {
      setPage(Math.floor(idx / pageSize) + 1);
    }
    scrollToHighlightRef.current = true;
    setHighlightId(next.id);
  };

  const handleWordAdded = (
    added: JpVocabWord,
    ref?: JpVocabRef,
    refDeduped?: boolean
  ) => {
    const nextWords = [...words, added];
    const nextRefs = ref
      ? { ...refs, [ref.ref_key]: { ...refs[ref.ref_key], ...ref } }
      : refs;
    const nextDisplayOrder: JpVocabDailyDisplayOrder = displayOrder.ids.includes(
      added.id
    )
      ? displayOrder
      : { ...displayOrder, ids: [...displayOrder.ids, added.id] };
    setWords(nextWords);
    setRefs(nextRefs);
    setDisplayOrder(nextDisplayOrder);
    persistCache(nextWords, nextRefs, nextDisplayOrder);
    setStatus(
      `已添加：${added.word}${refDeduped ? "（共用教案链接）" : ""}`
    );
  };

  const handleWordSaved = useCallback(
    (word: JpVocabWord) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === word.id ? word : w));
        persistCache(next, refs, displayOrderRef.current);
        return next;
      });
      setEditingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
      setViewingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
      if (editingRemarksIdRef.current !== word.id) {
        setStatus("词条已保存。");
      }
    },
    [refs, persistCache, setWords, setStatus]
  );

  const handleWordSaveFailed = useCallback(
    (wordId: number, snapshot: JpVocabWord, message: string) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === wordId ? snapshot : w));
        persistCache(next, refs, displayOrderRef.current);
        return next;
      });
      setStatus(message);
    },
    [refs, persistCache, setWords, setStatus]
  );

  const runExport = async (scope: JpVocabExportScope) => {
    if (exporting) return;
    const exportWords = resolveJpVocabExportWords(
      scope,
      words,
      displayOrder,
      sessionLevel
    );
    setExporting(true);
    setStatus("");
    setError("");
    try {
      const { exportJpVocabToWord } = await import("@/lib/jp-vocab-export");
      await exportJpVocabToWord(exportWords, scope, dailySeqByWordId);
      setShowExportChoice(false);
      setStatus(
        scope === "today_weak"
          ? `已导出今日未掌握 ${exportWords.length} 条到 Word。`
          : `已导出全部 ${exportWords.length} 条到 Word。`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const runExportExcel = async () => {
    if (exporting || !words.length) return;
    setExporting(true);
    setStatus("");
    setError("");
    try {
      const { exportJpVocabReviewStatsToExcel } = await import(
        "@/lib/jp-vocab-excel-export"
      );
      await exportJpVocabReviewStatsToExcel(words, displayOrder, quizTimeWeight);
      setShowExportChoice(false);
      setStatus(`已导出 ${words.length} 条复习次数统计到 Excel。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const runCoachExport = async () => {
    if (exporting) return;
    const items = buildJpVocabCoachExportItems(words, sessionLevel, displayOrder);
    if (!items.length) {
      setError("今日暂无勾选为「一般」或「不熟悉」的词条。");
      return;
    }

    setExporting(true);
    setStatus("");
    setError("");
    try {
      const result = await postJpVocabCoachMerge(locale, items);
      setShowExportChoice(false);
      setStatus(
        `已合并到课堂带读：未带读 ${result.pending_count} 条（新增 ${result.added_count}）。可打开「课堂带读」页面带读。`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const openRefPreview = (refKey: string, ref?: JpVocabRef) => {
    const meta = resolveJpVocabRefForPreview(refKey, refs, ref);
    setPreviewRef({ ref: meta, cacheVersion: ref?.updated_at ?? refs[refKey]?.updated_at });
  };

  if (checking) {
    return (
      <main
        className="page-wrap jp-vocab-page"
        style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}
      >
        <p style={{ color: "var(--muted)" }}>验证中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <TeacherReviewAuth
        variant="page"
        loginOnly
        title="登录 · 日语单词"
        subtitle="请登录后继续访问日语抽问。"
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

  const pageAccessDenied =
    (isAdminMode && !canAccessJpVocabAdminPage) ||
    (isTeacherMode && !canAccessJpVocabTeacherPage);

  if (pageAccessDenied) {
    return (
      <main
        className="page-wrap jp-vocab-page"
        style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>
          {isAdminMode ? "日语抽问-管理员端" : "日语抽问-老师端"}
        </h1>
        <p role="alert" style={{ color: "var(--rise)", marginBottom: "0.75rem" }}>
          当前账号无权访问此页面，请联系管理员在「角色权限管理」中开通对应权限。
        </p>
        {canAccessJpVocabStudy ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            你可前往{" "}
            <a href={jpVocabStudyPath()} style={{ color: "var(--accent)" }}>
              今日日语单词
            </a>
            。
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="page-wrap jp-vocab-page" style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>
        {isAdminMode ? "日语抽问-管理员端" : "日语抽问-老师端"}
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        {teacherShareUiEnabled ? (
          <>
            抽查 → 提问后勾选熟悉程度 → 答不出或不熟悉时点「发给学生」（同时
            <strong>系统自动标记为不熟悉</strong>），供学生复习。
          </>
        ) : isAdminMode ? (
          <>
            管理全库词条、设置今日抽查数量与导出。老师端按可见池抽查；学生端可通过「查看老师正在抽查的单词」获取当前词。
          </>
        ) : (
          <>
            抽查 → 提问后勾选熟悉程度。学生可通过「查看老师正在抽查的单词」获取当前词。
          </>
        )}
      </p>

      {!canOperate && !checking ? (
        <p
          className="hint"
          role="note"
          style={{
            marginBottom: "1rem",
            padding: "0.65rem 0.85rem",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "var(--panel)",
            fontSize: "0.875rem",
          }}
        >
          {user?.role === "user"
            ? "当前账号仅可浏览；修改数据需登录用户权限。"
            : "当前为浏览模式；修改数据需登录。"}
        </p>
      ) : null}

      {error ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
        </p>
      ) : null}

      {canOperate && (displayQuizProgress.total > 0 || displayQuizProgress.complete || isAdminMode) ? (
        <JpVocabDailyQuizProgressBar
          progress={displayQuizProgress}
          variant="teacher"
          adminQuizTarget={
            isAdminMode
              ? {
                  value: quizTargetInput,
                  savedValue: teacherVisibleLimit.quiz_target,
                  saving: settingQuizTarget,
                  onChange: setQuizTargetInput,
                  onSave: () => void setDailyQuizTarget(),
                }
              : undefined
          }
          coachAction={
            showTeacherCoachEntry
              ? {
                  busy: exporting,
                  coachCount:
                    dailyCoachLevelCounts.normal + dailyCoachLevelCounts.weak,
                  onClick: () => {
                    window.location.assign(jpVocabCoachPath());
                  },
                }
              : undefined
          }
        />
      ) : null}

      {isAdminMode ? (
        <JpVocabQuizTimeWeightAdmin
          value={quizTimeWeight}
          saving={settingQuizTimeWeight}
          onSave={setQuizTimeWeightConfig}
        />
      ) : null}

      <section className="section etr-panel" aria-label="单词表">
        <div
          className="jp-vocab-section-head"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>单词表</h2>
          <div className="jp-vocab-toolbar">
            <span className="jp-vocab-toolbar-summary" style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              {isAdminMode ? (
                <>
                  共 {words.length} 条
                  {words.length ? (
                    <>
                      {" "}
                      · 从未抽查{" "}
                      <span
                        className={
                          neverQuizzedCount > 0
                            ? "jp-vocab-today-summary-value jp-vocab-today-summary-value--never"
                            : "jp-vocab-today-summary-value"
                        }
                        title="复习合计为 0：历史上从未勾选过熟悉程度的词条数"
                      >
                        {neverQuizzedCount}
                      </span>
                    </>
                  ) : null}
                </>
              ) : null}
              {isAdminMode && words.length ? (
                <>
                  {" · "}
                  今日抽查{" "}
                  <span
                    className={
                      todayCheckStats.totalActions > 0
                        ? "jp-vocab-today-summary-value jp-vocab-today-summary-value--active"
                        : "jp-vocab-today-summary-value"
                    }
                    title={
                      todayCheckStats.totalActions > 0
                        ? `今日已抽查 ${todayCheckStats.wordCount} 个词条，共 ${todayCheckStats.totalActions} 次（北京时间 0 点归零）`
                        : "今日尚未抽查（北京时间 0 点归零）"
                    }
                  >
                    {todayCheckStats.wordCount} 个
                    {todayCheckStats.totalActions > todayCheckStats.wordCount
                      ? ` · ${todayCheckStats.totalActions} 次`
                      : null}
                  </span>
                </>
              ) : null}
              {canOperate ? (
                <>
                  {isAdminMode ? " · " : null}
                  本轮未勾选 {unmarkedCount}
                </>
              ) : null}
              {refreshing ? (
                <>
                  {isAdminMode || canOperate ? " · " : null}
                  加载中…
                </>
              ) : null}
            </span>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-toolbar-toggle jp-vocab-mobile-only"
              onClick={() => setMobileToolbarExpanded((v) => !v)}
              aria-expanded={mobileToolbarExpanded}
              aria-controls="jp-vocab-toolbar-actions"
            >
              {mobileToolbarExpanded ? "收起操作 ▲" : "展开操作 ▼"}
            </button>
            <div
              id="jp-vocab-toolbar-actions"
              className={`jp-vocab-toolbar-actions${
                mobileToolbarExpanded ? " jp-vocab-toolbar-actions--expanded" : ""
              }`}
            >
            {canOperate && quizTarget > 0 && quizTargetWords.length > 0 ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--primary"
                onClick={() => {
                  if (teacherQuizInProgress) {
                    resumeTeacherQuizFlashcard();
                    setStatus("继续今日抽查…");
                    return;
                  }
                  startTeacherQuizWithRandomMode();
                }}
                disabled={loading}
                title={
                  teacherQuizInProgress
                    ? "继续抽查卡片"
                    : "开始抽查（本轮自动随机选用正序或随机）"
                }
              >
                {teacherQuizInProgress ? "继续抽查" : "抽查"}
              </button>
            ) : null}
            {SHOW_RANDOM_HIGHLIGHT ? (
              <button
                type="button"
                className="btn-rsi-filter"
                onClick={() => pickNext()}
                disabled={loading || words.length < 2}
              >
                随机高亮
              </button>
            ) : null}
            {isAdminMode ? (
              <button
                type="button"
                className="btn-rsi-filter"
                onClick={() => setShowExportChoice(true)}
                disabled={loading || exporting || !words.length}
                title="导出 Word 或 Excel（复习次数统计）"
              >
                {exporting ? "导出中…" : "导出"}
              </button>
            ) : null}
            {SHOW_RISK_CHART ? (
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={() => setShowRiskChart(true)}
              disabled={loading || !words.length}
              title="按抽查优先级查看知识点排行，辅助下节课抽查"
            >
              抽查排行
            </button>
            ) : null}
            {canManualAdd ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={() => {
                if (!user) {
                  setStatus("请登录后再手动添加。");
                  openJpAuth();
                  return;
                }
                setShowManualAdd(true);
              }}
              disabled={loading}
              title={user ? undefined : "登录后可添加"}
            >
              手动添加
            </button>
            ) : null}
            {isAdminMode ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--danger"
                onClick={openResetChoice}
                disabled={loading || resetting || !words.length || !canOperate}
                title={canOperate ? undefined : "登录后可重置"}
              >
                {resetting ? "重置中…" : "重置"}
              </button>
            ) : null}
            </div>
          </div>
        </div>

        {status ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            {status}
          </p>
        ) : null}

        {saveQueuePending > 0 ? (
          <p
            className="jp-vocab-save-queue-hint"
            role="status"
            style={{ color: "var(--muted)", fontSize: "0.8125rem", marginBottom: "0.75rem" }}
          >
            后台同步队列 {saveQueuePending} 项 · 逐项写入数据库，避免免费服务器拥堵
          </p>
        ) : null}

        {!loading && words.length ? (
          <div className="jp-vocab-help">
            <button
              type="button"
              className="jp-vocab-help-toggle"
              onClick={() => setShowVocabHelp((v) => !v)}
              aria-expanded={showVocabHelp}
            >
              {showVocabHelp ? "收起说明" : "展开说明"}
              <span className="jp-vocab-help-toggle-icon" aria-hidden="true">
                {showVocabHelp ? "▲" : "▼"}
              </span>
            </button>
            {showVocabHelp ? (
              <p className="jp-vocab-risk-hint" role="note">
                <strong>{jpVocabPriorityLabel(locale)}</strong>
                ：列表与卡片展示的是「最终抽问得分」= 基础优先级 + 距上次抽问天数 × 时间权重（管理员可调，当前{" "}
                {quizTimeWeight}）。
                基础优先级：一般 × 1 + 不熟悉 × 2 − 非常熟悉 × 0.3（保留 1 位小数）。
                久未复习会自动抬升得分，避免「非常熟悉」后几个月再也抽不到。
                ≥ 3 建议重点抽查，≥ 1 建议留意，&lt; 1 掌握较好；
                为 0 或更低表示尚未复习，或多次勾选「非常熟悉」且近期刚抽过。
                「今日抽查次数」：每勾选一次熟悉程度 +1，北京时间 0 点自动归零；同一单词今日内改选（如非常熟悉改一般）视为修正，不重复计次，只按最后一次勾选更新统计。
                单词表默认按当日固定序号（凌晨按最终得分重排）；当天内勾选或刷新页面不会改变顺序（所有老师看到相同顺序）。管理员在「今日抽查数量」中设置目标后，系统为老师生成可见池（当日序号正序 1…N）；今日新入库从未抽查词不进池。跨日自动回到默认设置。管理员可使用「重置 → 今日重置」立即重排并清空当前轮次勾选，统计次数不变。
                搜索框在本地对已加载词表即时过滤，支持单词、读音、释义、词性等字段模糊匹配，多个关键词用空格隔开（需同时满足）；旁边可按「全部 / 单词 / 语法」筛选类型。
                备注编辑后约 1 秒自动保存并写入数据库；其他端约 1 秒自动拉取变更（标签页在后台时会降频）。
              </p>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: "var(--muted)" }}>加载中…</p>
        ) : !words.length ? (
          <p style={{ color: "var(--muted)" }}>
            暂无条目。复习词表由「日语新课」自动导入
            {canManualAdd ? "，也可点「手动添加」补充" : ""}。
          </p>
        ) : hideTeacherQuizList ? (
          <div className="jp-vocab-teacher-quiz-resume" role="status">
            <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
              今日抽查进行中，请在单词卡片内逐词勾选熟悉程度。
            </p>
            {!showQuizFlashcard ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--primary"
                onClick={() => resumeTeacherQuizFlashcard()}
              >
                继续抽查
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div
              className="jp-vocab-mobile-sort jp-vocab-mobile-only"
              role="group"
              aria-label="单词表排序"
            >
              <button
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-sort-btn${
                  useDailyRowOrder ? " jp-vocab-mobile-sort-btn--active" : ""
                }`}
                onClick={restoreDailyRowOrder}
                title="恢复当日固定顺序（北京时间 0 点重排，当天内不变）"
              >
                默认顺序
              </button>
              <button
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-sort-btn${
                  !useDailyRowOrder && statSort.key === "risk"
                    ? " jp-vocab-mobile-sort-btn--active"
                    : ""
                }`}
                aria-pressed={!useDailyRowOrder && statSort.key === "risk"}
                title={`按${jpVocabPriorityLabel(locale)}（最终得分=基础优先级+天数×${quizTimeWeight}）排序；再次点击切换升降序`}
                onClick={() => toggleStatSort("risk")}
              >
                {jpVocabPriorityLabel(locale)}
                {!useDailyRowOrder && statSort.key === "risk" ? (
                  <span className="jp-vocab-mobile-sort-indicator" aria-hidden="true">
                    {statSort.dir === "desc" ? " ↓" : " ↑"}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-sort-btn${
                  !useDailyRowOrder && statSort.key === "seq"
                    ? " jp-vocab-mobile-sort-btn--active"
                    : ""
                }`}
                aria-pressed={!useDailyRowOrder && statSort.key === "seq"}
                title="按当日固定序号排序；再次点击切换升降序"
                onClick={() => toggleStatSort("seq")}
              >
                当日序号
                {!useDailyRowOrder && statSort.key === "seq" ? (
                  <span className="jp-vocab-mobile-sort-indicator" aria-hidden="true">
                    {statSort.dir === "desc" ? " ↓" : " ↑"}
                  </span>
                ) : null}
              </button>
            </div>
            <div className="jp-vocab-search" role="search">
              <label htmlFor="jp-vocab-search" className="jp-vocab-search__label">
                搜索
              </label>
              <div className="jp-vocab-search__row">
                <input
                  id="jp-vocab-search"
                  type="search"
                  className="jp-vocab-search__input"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="单词、读音、释义、词性…（搜索全库，本地即时）"
                  disabled={loading}
                  autoComplete="off"
                  spellCheck={false}
                />
                <select
                  id="jp-vocab-kind-filter"
                  className="jp-vocab-search__kind"
                  value={kindFilter}
                  onChange={(e) => {
                    setKindFilter(e.target.value as JpVocabKindFilter);
                    setPage(1);
                  }}
                  disabled={loading}
                  aria-label="类型筛选"
                >
                  <option value="all">全部</option>
                  <option value="word">单词</option>
                  <option value="grammar">语法</option>
                </select>
              </div>
              {filterActive ? (
                <>
                  <button
                    type="button"
                    className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-search__clear"
                    onClick={() => {
                      setSearchQuery("");
                      setKindFilter("all");
                      setPage(1);
                    }}
                  >
                    清除
                  </button>
                  <span className="jp-vocab-search__meta">
                    匹配 {filteredDisplayedWords.length} / {searchMatchedWords.length} 条
                  </span>
                </>
              ) : null}
            </div>
            {filterActive && !filteredDisplayedWords.length ? (
              <p className="jp-vocab-search__empty">
                {searchActive &&
                searchMatchedWords.length > 0 &&
                hideInoperableRows &&
                !dailyQuizProgress.complete
                  ? `全库有匹配「${searchQuery.trim()}」的词条，但超出今日可抽查序号或已满 1 小时不可改，老师端不显示。`
                  : searchActive
                  ? `没有匹配「${searchQuery.trim()}」的词条，请换个关键词试试。`
                  : kindFilter === "grammar"
                    ? "当前没有语法条目。"
                    : "当前没有单词条目。"}
              </p>
            ) : !filterActive &&
              !filteredDisplayedWords.length &&
              hideInoperableRows &&
              (dailyQuizProgress.complete || displayQuizProgress.complete) ? (
              <p className="jp-vocab-search__empty">
                今日抽查已完成，但暂无已抽查词条记录。
              </p>
            ) : filteredDisplayedWords.length ? (
          <>
          <JpVocabWordTable
            locale={locale}
            isAdmin={isAdminMode}
            canOperate={canOperate}
            statSort={statSort}
            onStatSort={toggleStatSort}
            words={pagedDisplayedWords}
            highlightId={highlightId}
            displayOrder={displayOrder}
            sessionLevel={sessionLevel}
            sessionReviewAt={sessionReviewAt}
            wordSyncState={wordSyncState}
            deletingId={deletingId}
            shareProgressMap={shareProgressMap}
            sharedTodayWordIds={sharedTodayWordIds}
            refs={refs}
            dailySeqByWordId={dailySeqByWordId}
            quizTarget={quizTarget}
            quizTimeWeight={quizTimeWeight}
            teacherQuizLocksTable={teacherQuizLocksTable}
            isWordInQuizTarget={isWordInQuizTarget}
            isWordReviewLocked={isWordReviewLocked}
            quizSession={quizSession}
            openRemarksWord={openRemarksWord}
            onEditRemarks={setEditingRemarksWord}
            onReadingCopy={showReadingCopyToast}
            onRefPreview={openRefPreview}
            onEditWord={setEditingWord}
            onDeleteWord={(w) => void deleteWord(w)}
            onBoostQuizPriority={
              isAdminMode ? (w) => void boostQuizPriority(w) : undefined
            }
            quizPriorityBoost={isAdminMode ? quizPriorityBoost : null}
            boostingWordId={boostingWordId}
            onPreviewQuizCard={
              isAdminMode
                ? (w) => {
                    setQuizCardPreviewWordId(w.id);
                  }
                : undefined
            }
            onViewMnemonic={setViewingMnemonicWord}
            onRecordLevel={(wordId, level) => void tryRecordLevel(wordId, level)}
            onResumeQuiz={(wordId) => resumeTeacherQuizFlashcard(wordId)}
            onRequestQuizMode={(wordId) => {
              startTeacherQuizWithRandomMode(wordId);
            }}
            onStatus={setStatus}
          />
            <JpVocabPagination
              safePage={safePage}
              totalPages={totalPages}
              pageRangeStart={pageRangeStart}
              pageRangeEnd={pageRangeEnd}
              totalItems={filteredDisplayedWords.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
            ) : null}
          </>
        )}
      </section>

      <JpVocabExportChoiceModal
        open={showExportChoice}
        busy={exporting}
        allCount={words.length}
        todayWeakCount={todayWeakExportWords.length}
        onClose={() => {
          if (!exporting) setShowExportChoice(false);
        }}
        onExport={(scope) => void runExport(scope)}
        onExportExcel={() => void runExportExcel()}
        onExportToCoach={() => void runCoachExport()}
      />

      <JpVocabResetChoiceModal
        open={showResetChoice}
        busy={resetting}
        onClose={() => setShowResetChoice(false)}
        onResetToday={resetToday}
        onResetAll={resetAll}
      />

      {canManualAdd ? (
      <JpVocabManualAddModal
        open={showManualAdd}
        locale={locale}
        onClose={() => setShowManualAdd(false)}
        onAdded={handleWordAdded}
      />
      ) : null}

      {SHOW_RISK_CHART ? (
      <JpVocabRiskChartModal
        open={showRiskChart}
        words={quizTargetWords}
        timeWeight={quizTimeWeight}
        onClose={() => setShowRiskChart(false)}
      />
      ) : null}

      {user && !isAdminMode ? (
        <JpVocabDailyQuizIntroModal
          userId={user.id}
          open={showDailyIntro}
          onClose={() => setShowDailyIntro(false)}
        />
      ) : null}

      {user && !isAdminMode ? (
        <JpVocabDailyQuizCompleteModal
          open={showDailyComplete}
          total={dailyQuizProgress.total}
          variant="teacher"
          levelCounts={dailyCoachLevelCounts}
          onGoToCoach={
            showTeacherCoachEntry
              ? () => {
                  window.location.assign(jpVocabCoachPath());
                }
              : undefined
          }
          onClose={() => {
            markJpVocabTeacherDailyCompleteDismissed(
              user.id,
              dailyQuizProgress.total
            );
            setShowDailyComplete(false);
          }}
        />
      ) : null}

      {JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED ? (
        <JpVocabShareRequestModal
          open={showShareRequestModal}
          requests={shareRequests}
          onClose={() => void dismissShareRequests()}
        />
      ) : null}

      <JpVocabRemarksViewModal
        open={viewingRemarksWord != null}
        word={viewingRemarksWord}
        canDelete={canOperate}
        onClose={() => setViewingRemarksWord(null)}
        onWordUpdated={handleWordSaved}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openJpAuth}
      />

      <JpVocabMnemonicViewModal
        open={viewingMnemonicWord != null}
        word={viewingMnemonicWord}
        onClose={() => setViewingMnemonicWord(null)}
      />

      <CopyToast message={copyToast} onDismiss={() => setCopyToast(null)} />

      <JpVocabRefPreviewModal
        open={previewRef != null}
        refMeta={previewRef?.ref ?? null}
        cacheVersion={previewRef?.cacheVersion}
        onClose={() => setPreviewRef(null)}
      />

      <JpClassNotesEditModal
        open={editingRemarksWord != null}
        word={editingRemarksWord}
        locale={locale}
        canEdit={canOperate}
        sharedToday={
          editingRemarksWord != null &&
          sharedTodayWordIds.has(editingRemarksWord.id)
        }
        sharePromptOnSave={showQuizFlashcard}
        onClose={() => setEditingRemarksWord(null)}
        onSaved={handleWordSaved}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openJpAuth}
        onSharedToStudy={(wordId) => {
          setSharedTodayWordIds((prev) => new Set([...prev, wordId]));
        }}
      />

      <JpVocabEditModal
        open={editingWord != null}
        word={editingWord}
        refs={refs}
        locale={locale}
        canEdit={canOperate}
        showMnemonic={isAdmin}
        onClose={() => setEditingWord(null)}
        onSaved={handleWordSaved}
        onRefUpdated={(ref) => {
          setRefs((prev) => ({ ...prev, [ref.ref_key]: ref }));
        }}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openJpAuth}
      />

      {user ? (
        <JpVocabTeacherQuizIntroModal
          userId={user.id}
          open={showTeacherQuizIntro}
          onConfirm={handleTeacherQuizIntroConfirm}
          onClose={handleTeacherQuizIntroClose}
        />
      ) : null}

      <JpVocabTeacherQuizFlashcardModal
        open={showQuizFlashcard}
        session={quizSession}
        wordsById={wordsById}
        refs={refs}
        locale={locale}
        displayOrder={displayOrder}
        sessionLevel={sessionLevel}
        reviewLockedByWordId={reviewLockedByWordId}
        savingWordId={quizFlashcardSavingWordId}
        wordSyncState={wordSyncState}
        dailySeqByWordId={dailySeqByWordId}
        dailyQuizProgress={displayQuizProgress}
        quizTimeWeight={quizTimeWeight}
        canOperate={canOperate}
        shareUiEnabled={teacherShareUiEnabled}
        shareProgressMap={shareProgressMap}
        sharedTodayWordIds={sharedTodayWordIds}
        studentPeeked={studentPeekedCurrentWord}
        onClose={() => setShowQuizFlashcard(false)}
        onComplete={finishTeacherQuiz}
        onSelectLevel={(wordId, level) => void recordLevel(wordId, level, "flashcard")}
        onNavigate={(index) =>
          setQuizSession((prev) => (prev ? { ...prev, currentIndex: index } : prev))
        }
        onOpenRef={openRefPreview}
        onViewRemarks={openRemarksWord}
        onEditRemarks={setEditingRemarksWord}
        onEditWord={setEditingWord}
        onShare={(wordId) => void shareWord(wordId)}
        onUnshare={(wordId) => void unshareWord(wordId)}
        onWordUpdated={handleWordSaved}
        nestedModalOpen={
          viewingRemarksWord != null ||
          previewRef != null ||
          editingRemarksWord != null ||
          editingWord != null
        }
      />

      {isAdminMode ? (
        <JpVocabTeacherQuizFlashcardModal
          open={quizCardPreviewSession != null}
          session={quizCardPreviewSession}
          wordsById={wordsById}
          refs={refs}
          locale={locale}
          displayOrder={displayOrder}
          sessionLevel={sessionLevel}
          reviewLockedByWordId={reviewLockedByWordId}
          savingWordId={null}
          dailySeqByWordId={dailySeqByWordId}
          dailyQuizProgress={null}
          quizTimeWeight={quizTimeWeight}
          canOperate
          shareUiEnabled={false}
          previewMode
          onClose={closeQuizCardPreview}
          onComplete={closeQuizCardPreview}
          onSelectLevel={() => {
            /* 预览只读 */
          }}
          onNavigate={() => {
            /* 单条预览 */
          }}
          onOpenRef={openRefPreview}
          onViewRemarks={openRemarksWord}
          onEditRemarks={setEditingRemarksWord}
          onEditWord={setEditingWord}
          onWordUpdated={handleWordSaved}
          nestedModalOpen={
            viewingRemarksWord != null ||
            previewRef != null ||
            editingRemarksWord != null ||
            editingWord != null
          }
        />
      ) : null}

      <JpVocabPageStyles />

      <MobileScrollToTopButton />
    </main>
  );
}
