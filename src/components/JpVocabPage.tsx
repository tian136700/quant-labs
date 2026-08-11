"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { jpVocabTotalReviews, sortJpVocabWordsForDisplay } from "@/lib/jp-vocab-shared";
import { buildJpVocabDailySeqMap } from "@/lib/jp-vocab-daily-order";
import {
  filterJpVocabWordsBySearch,
  type JpVocabKindFilter,
} from "@/lib/jp-vocab-search";
import { MobileScrollToTopButton } from "@/components/MobileScrollToTopButton";
import { JpVocabPageGates } from "@/components/jp-vocab-page/JpVocabPageGates";
import { shouldShowJpVocabDailyIntro } from "@/components/JpVocabDailyQuizIntroModal";
import { JpVocabPageHeaderSlot } from "@/components/jp-vocab-page/JpVocabPageHeaderSlot";
import { JpVocabPageModals } from "@/components/jp-vocab-page/JpVocabPageModals";
import { JpVocabPageStatusHints } from "@/components/jp-vocab-page/JpVocabPageStatusHints";
import { JpVocabPageStyles } from "@/components/jp-vocab-page/JpVocabPageStyles";
import { JpVocabPageToolbar } from "@/components/jp-vocab-page/JpVocabPageToolbar";
import { JpVocabPageWordList } from "@/components/jp-vocab-page/JpVocabPageWordList";
import { countJpVocabCoachLevelCounts } from "@/lib/jp-vocab-coach";
import { jpVocabAdminPath, jpVocabCoachPath, jpVocabPath, jpVocabStudyPath } from "@/lib/locale-path";
import { jpVocabTodayCheckStats } from "@/lib/jp-vocab-daily-check";
import {
  isVocabTeacherAccountActiveForRefresh,
  VOCAB_TEACHER_SOFT_REFRESH_MS,
} from "@/lib/vocab-poll-throttle";
import { markJpVocabTeacherDailyCompleteDismissed } from "@/lib/jp-vocab-daily-complete-dismiss";
import { filterJpVocabTodayWeakWords } from "@/lib/jp-vocab-export-select";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import {
  isJpVocabWordQuizCheckedToday,
  listJpVocabTeacherQuizPoolWords,
} from "@/lib/jp-vocab-teacher-visible";
import { computeJpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import { JP_VOCAB_TEACHER_SHARE_ENABLED } from "@/lib/jp-vocab-share-ui";
import { useJpVocabAdminActions } from "@/hooks/useJpVocabAdminActions";
import { useJpVocabDailyCompleteEffects } from "@/hooks/useJpVocabDailyCompleteEffects";
import { useJpVocabExportActions } from "@/hooks/useJpVocabExportActions";
import { useJpVocabPageWordHandlers } from "@/hooks/useJpVocabPageWordHandlers";
import { useJpVocabPageSync } from "@/hooks/useJpVocabPageSync";
import { useJpVocabReviewActions } from "@/hooks/useJpVocabReviewActions";
import { useVocabShareBackfillOnComplete } from "@/hooks/useVocabShareBackfillOnComplete";
import { useJpVocabPageStatSort } from "@/hooks/useJpVocabPageStatSort";
import { useJpVocabSearchFreshLoad } from "@/hooks/useJpVocabSearchFreshLoad";
import { useJpVocabShareRequests } from "@/hooks/useJpVocabShareRequests";
import { useJpVocabTeacherQuiz } from "@/hooks/useJpVocabTeacherQuiz";
import { useJpVocabTeacherQuizListGate } from "@/hooks/useJpVocabTeacherQuizListGate";
import { useVocabTeacherQuizSyncPollActive } from "@/hooks/useVocabTeacherQuizSyncPollActive";
import {
  jpVocabWordsInOrder,
  readStoredJpVocabKindFilter,
  readStoredJpVocabPage,
  readStoredJpVocabPageSize,
  readStoredJpVocabSearchQuery,
  writeStoredJpVocabPage,
  writeStoredJpVocabPageSize,
} from "@/lib/jp-vocab-page-helpers";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

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
  const isAdminMode = variant === "admin";
  const isTeacherMode = variant === "teacher";
  const canOperate = canAccessJpVocab;
  const canManualAdd = hasPermission("jp_vocab:manual_add");
  const canShareToStudy = canAccessJpVocab;
  const teacherShareUiEnabled =
    JP_VOCAB_TEACHER_SHARE_ENABLED && isTeacherMode && canShareToStudy;
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
  const [sessionLevel, setSessionLevel] = useState<
    Record<number, JpVocabLevel | undefined>
  >({});
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
  const [searchQuery, setSearchQuery] = useState(() => readStoredJpVocabSearchQuery());
  const [kindFilter, setKindFilter] = useState<JpVocabKindFilter>(
    () => readStoredJpVocabKindFilter()
  );
  const [page, setPage] = useState(() => readStoredJpVocabPage());
  const [pageSize, setPageSize] = useState(() => readStoredJpVocabPageSize());
  const {
    statSort,
    useDailyRowOrder,
    toggleStatSort,
    restoreDailyRowOrder,
  } =
    useJpVocabPageStatSort({ onSortChange: () => setPage(1) });
  const [showExportChoice, setShowExportChoice] = useState(false);
  const [showRiskChart, setShowRiskChart] = useState(false);
  const [showDailyIntro, setShowDailyIntro] = useState(false);
  const [showDailyComplete, setShowDailyComplete] = useState(false);
  const [showVocabHelp, setShowVocabHelp] = useState(false);
  const [mobileToolbarExpanded, setMobileToolbarExpanded] = useState(false);
  const [reviewLockNow, setReviewLockNow] = useState(() => Date.now());
  const sessionLevelRef = useRef(sessionLevel);
  const editingRemarksIdRef = useRef<number | null>(null);
  const sharedTodayWordIdsRef = useRef<Set<number>>(new Set());
  const teacherIdleCompleteRef = useRef(false);
  const teacherQuizIdleRef = useRef(false);
  const scrollToHighlightRef = useRef(false);
  const [teacherQuizPollGate, setTeacherQuizPollGate] = useState({
    showQuizFlashcard: false, quizComplete: false,
  });
  const { active: teacherQuizPollActive, idle: teacherQuizPollIdle } =
    useVocabTeacherQuizSyncPollActive({
      enabled: isTeacherMode,
      showQuizFlashcard: teacherQuizPollGate.showQuizFlashcard,
      quizComplete: teacherQuizPollGate.quizComplete,
      sessionReviewAt,
    });
  teacherQuizIdleRef.current = teacherQuizPollIdle;

  const onDayRolloverClearSession = useCallback(() => {
    setSessionLevel({});
    setSessionReviewAt({});
    setHighlightId(null);
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
    quizPriorityBoost,
    setQuizPriorityBoost,
    displayOrderRef,
    wordsRef,
    refsRef,
    persistCache,
    loadWords,
    syncTeacherVisibleLimitFromServer,
  } = useJpVocabPageSync({
    checking,
    user,
    editingRemarksWordId: editingRemarksWord?.id ?? null,
    editingWordId: editingWord?.id ?? null,
    teacherIdleCompleteRef,
    teacherQuizIdleRef,
    enableBackgroundSyncPoll: false,
    teacherQuizPollIdle,
    setViewingRemarksWord,
    onLoadError: setError,
    onDayRolloverClearSession,
  });

  const handleRefreshWords = useCallback(() => {
    void syncTeacherVisibleLimitFromServer();
    void loadWords({ force: true });
  }, [loadWords, syncTeacherVisibleLimitFromServer]);

  // 搜索时强制拉最新词表，避免匹配到 localStorage SWR 过期数据
  useJpVocabSearchFreshLoad(searchQuery, loadWords);

  // 账号正常：约 30 分钟软刷新今日抽查数量/词表（老师+管理员；禁用账号不刷新）
  useEffect(() => {
    if (!isTeacherMode && !isAdminMode) return;
    if (!isVocabTeacherAccountActiveForRefresh(user)) return;
    const timer = window.setInterval(() => {
      // 抽查进行中（以及抽完后 30 分钟 grace 冷却）禁止软刷新，避免重建抽查卡状态
      if (teacherQuizPollActive) return;
      handleRefreshWords();
    }, VOCAB_TEACHER_SOFT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [
    isTeacherMode,
    isAdminMode,
    user,
    handleRefreshWords,
    teacherQuizPollActive,
  ]);

  const { shareRequests, showShareRequestModal, dismissShareRequests } =
    useJpVocabShareRequests({
      canOperate,
      teacherIdleCompleteRef,
      teacherQuizIdleRef,
      setStatus,
      username: user?.username,
      pollActive: teacherQuizPollActive,
      pollIdle: teacherQuizPollIdle,
    });

  const { exporting, runExport, runExportExcel, runCoachExport } =
    useJpVocabExportActions({
      locale,
      setStatus,
      setError,
      onCloseExportChoice: () => setShowExportChoice(false),
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

  const dailySeqByWordId = useMemo(
    () => buildJpVocabDailySeqMap(displayOrder.ids),
    [displayOrder.ids]
  );

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
      dailySeqByWordId,
    });
  }, [
    words,
    statSort,
    displayOrder.ids,
    useDailyRowOrder,
    quizTimeWeight,
    dailySeqByWordId,
  ]);

  const quizTarget = teacherVisibleLimit.quiz_target;

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

  const { onTeacherQuizSessionFinished } = useJpVocabDailyCompleteEffects({
    locale,
    userId: user?.id,
    isAdminMode,
    canOperate,
    loading,
    checking,
    wordsLength: words.length,
    showDailyComplete,
    dailyQuizProgress,
    sessionLevelRef,
    wordsRef,
    displayOrderRef,
    setShowDailyComplete,
    setStatus,
    setError,
  });

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
    navigateQuizCardPreview,
    closeQuizCardPreview,
    openPostCompleteLastWord,
    quizWordHasLevel,
    startTeacherQuizWithRandomMode,
    resumeTeacherQuizFlashcard,
    finishTeacherQuiz,
    closeTeacherQuizFlashcard,
    teacherQuizLocksTable,
    teacherQuizInProgress,
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
    teacherQuizIdleRef, teacherQuizPollIdle,
    setStatus,
    onTeacherQuizSessionFinished,
  });

  const {
    isWordInQuizTarget,
    isWordReviewLocked,
    teacherPendingWords,
    displayQuizProgress,
    hideTeacherQuizList,
    showTeacherQuizStartLanding,
  } = useJpVocabTeacherQuizListGate({
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
  });

  const {
    wordSyncState,
    shareProgressMap,
    saveQueuePending,
    reviewLockedByWordId,
    recordLevel,
    tryRecordLevel,
    shareWord,
    ensureWordSharedBeforeNext,
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
    setTeacherVisibleLimit,
    setHighlightId,
    setStatus,
    openJpAuth,
    refresh,
    persistCache,
  });

  useVocabShareBackfillOnComplete({
    enabled: canOperate && !isAdminMode && canShareToStudy,
    complete: displayQuizProgress.complete || dailyQuizProgress.complete,
    poolWordIds: quizTargetWords.map((w) => w.id),
    hasLevel: quizWordHasLevel,
    isSharedToday: (id) => sharedTodayWordIds.has(id),
    shareWord,
    excludeWordId:
      showQuizFlashcard && quizSession
        ? quizSession.wordIds[quizSession.currentIndex] ?? null
        : null,
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
    boostQuizPriority,
    deleteWord,
    openResetChoice,
    resetToday,
    resetAll,
    setDailyQuizTarget,
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
    setSessionLevel,
    setSessionReviewAt,
    setHighlightId,
    restoreDailyRowOrder,
    setPage,
    persistCache,
  });

  const searchActive = searchQuery.trim().length > 0;
  const hideInoperableRows = canOperate && !isAdminMode;
  const filterActive = searchActive || kindFilter !== "all";

  const searchMatchedWords = useMemo(
    () => filterJpVocabWordsBySearch(displayedWords, searchQuery, kindFilter),
    [displayedWords, searchQuery, kindFilter]
  );

  const filteredDisplayedWords = useMemo(() => {
    if (!hideInoperableRows) return searchMatchedWords;
    const now = new Date(reviewLockNow);
    if (dailyQuizProgress.complete || displayQuizProgress.complete) {
      return searchMatchedWords.filter((w) =>
        isJpVocabWordQuizCheckedToday(w, displayOrder, now)
      );
    }
    return searchMatchedWords.filter((w) =>
      teacherPendingWords.some((item) => item.id === w.id)
    );
  }, [
    hideInoperableRows,
    searchMatchedWords,
    dailyQuizProgress.complete,
    displayQuizProgress.complete,
    displayOrder,
    reviewLockNow,
    teacherPendingWords,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredDisplayedWords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedDisplayedWords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredDisplayedWords.slice(start, start + pageSize);
  }, [filteredDisplayedWords, safePage, pageSize]);
  const pageRangeStart =
    filteredDisplayedWords.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageRangeEnd = Math.min(safePage * pageSize, filteredDisplayedWords.length);

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

  useEffect(() => {
    teacherIdleCompleteRef.current =
      canOperate && !isAdminMode && dailyQuizProgress.complete;
  }, [canOperate, isAdminMode, dailyQuizProgress.complete]);

  const anyCheckedInRound = useMemo(
    () => (displayOrder.round_checked_ids ?? []).length > 0,
    [displayOrder.round_checked_ids]
  );

  useEffect(() => {
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

  const unmarkedCount = useMemo(
    () =>
      quizTargetWords.filter(
        (w) => !effectiveJpVocabDisplayLevel(w, sessionLevel[w.id], { displayOrder })
      ).length,
    [quizTargetWords, sessionLevel, displayOrder]
  );
  const pendingQuizWords = useMemo(
    () =>
      quizTargetWords
        .filter(
          (w) =>
            !effectiveJpVocabDisplayLevel(w, sessionLevel[w.id], { displayOrder })
        )
        .map((w) => ({ id: w.id, word: w.word })),
    [quizTargetWords, sessionLevel, displayOrder]
  );
  const neverQuizzedCount = useMemo(
    () => (isAdminMode ? words.filter((w) => jpVocabTotalReviews(w) === 0).length : 0),
    [isAdminMode, words]
  );
  const todayWeakExportWords = useMemo(
    () => filterJpVocabTodayWeakWords(words, sessionLevel, displayOrder),
    [words, sessionLevel, displayOrder]
  );
  const dailyCoachLevelCounts = useMemo(
    () => countJpVocabCoachLevelCounts(quizTargetWords, sessionLevel, displayOrder),
    [quizTargetWords, sessionLevel, displayOrder]
  );
  const todayCheckStats = useMemo(() => jpVocabTodayCheckStats(words), [words]);

  const {
    openRemarksWord,
    showReadingCopyToast,
    pickNext,
    handleWordAdded,
    handleWordSaved,
    handleWordSaveFailed,
    openRefPreview,
  } = useJpVocabPageWordHandlers({
    locale,
    canOperate,
    words,
    refs,
    displayOrderRef,
    editingRemarksIdRef,
    quizTargetWords,
    sessionReviewAt,
    highlightId,
    filteredDisplayedWords,
    pageSize,
    isWordReviewLocked,
    setWords,
    setRefs,
    setDisplayOrder,
    setEditingRemarksWord,
    setViewingRemarksWord,
    setPreviewRef,
    setHighlightId,
    setPage,
    setStatus,
    setCopyToast,
    persistCache,
    scrollToHighlightRef,
  });

  // Call as function: JSX `<Gates />` is always truthy even when Gates returns null
  // (would blank the whole /jp-vocab page for authorized users).
  const gate = JpVocabPageGates({
    checking,
    user,
    setUser,
    isAdminMode,
    isTeacherMode,
    canAccessJpVocabAdminPage,
    canAccessJpVocabTeacherPage,
    canAccessJpVocabStudy,
  });
  if (gate != null) return gate;

  return (
    <main
      className="page-wrap jp-vocab-page"
      style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}
    >
      <JpVocabPageHeaderSlot
        isAdminMode={isAdminMode}
        teacherShareUiEnabled={teacherShareUiEnabled}
        canOperate={canOperate}
        checking={checking}
        userRole={user?.role}
        error={error}
        displayQuizProgress={displayQuizProgress}
        quizTargetInput={quizTargetInput}
        teacherVisibleQuizTarget={teacherVisibleLimit.quiz_target}
        settingQuizTarget={settingQuizTarget}
        showTeacherCoachEntry={showTeacherCoachEntry}
        exporting={exporting}
        dailyCoachLevelCounts={dailyCoachLevelCounts}
        onQuizTargetInputChange={setQuizTargetInput}
        onSaveQuizTarget={() => void setDailyQuizTarget()}
      />

      <section className="section etr-panel" aria-label="单词表">
        <JpVocabPageToolbar
          isAdminMode={isAdminMode}
          canOperate={canOperate}
          canManualAdd={canManualAdd}
          loading={loading}
          refreshing={refreshing}
          wordsCount={words.length}
          neverQuizzedCount={neverQuizzedCount}
          unmarkedCount={unmarkedCount}
          todayCheckStats={todayCheckStats}
          quizTarget={quizTarget}
          quizTargetWordsLength={quizTargetWords.length}
          teacherQuizInProgress={teacherQuizInProgress}
          hideStartQuizButton={showTeacherQuizStartLanding}
          exporting={exporting}
          resetting={resetting}
          mobileToolbarExpanded={mobileToolbarExpanded}
          onToggleMobileToolbar={() => setMobileToolbarExpanded((v) => !v)}
          onRefresh={() => handleRefreshWords()}
          onResumeOrStartQuiz={() => {
            if (teacherQuizInProgress) {
              resumeTeacherQuizFlashcard();
              setStatus("继续今日抽查…");
              return;
            }
            startTeacherQuizWithRandomMode();
          }}
          onPickNext={pickNext}
          onOpenExportChoice={() => setShowExportChoice(true)}
          onShowRiskChart={() => setShowRiskChart(true)}
          onManualAdd={() => {
            if (!user) {
              setStatus("请登录后再手动添加。");
              openJpAuth();
              return;
            }
            setShowManualAdd(true);
          }}
          onOpenResetChoice={openResetChoice}
        />

        <JpVocabPageStatusHints
          status={status}
          saveQueuePending={saveQueuePending}
        />

        <JpVocabPageWordList
          locale={locale}
          loading={loading}
          isAdminMode={isAdminMode}
          canOperate={canOperate}
          canManualAdd={canManualAdd}
          wordsLength={words.length}
          hideTeacherQuizList={hideTeacherQuizList}
          showTeacherQuizStartLanding={showTeacherQuizStartLanding}
          teacherQuizInProgress={teacherQuizInProgress}
          remainingQuizCount={unmarkedCount}
          pendingQuizWords={pendingQuizWords}
          showQuizFlashcard={showQuizFlashcard}
          showVocabHelp={showVocabHelp}
          quizTimeWeight={quizTimeWeight}
          searchQuery={searchQuery}
          kindFilter={kindFilter}
          filterActive={filterActive}
          searchActive={searchActive}
          useDailyRowOrder={useDailyRowOrder}
          statSort={statSort}
          hideInoperableRows={hideInoperableRows}
          dailyQuizComplete={dailyQuizProgress.complete}
          filteredDisplayedWords={filteredDisplayedWords}
          searchMatchedWords={searchMatchedWords}
          pagedDisplayedWords={pagedDisplayedWords}
          safePage={safePage}
          totalPages={totalPages}
          pageRangeStart={pageRangeStart}
          pageRangeEnd={pageRangeEnd}
          pageSize={pageSize}
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
          teacherQuizLocksTable={teacherQuizLocksTable}
          quizSession={quizSession}
          quizPriorityBoost={isAdminMode ? quizPriorityBoost : null}
          boostingWordId={boostingWordId}
          isWordInQuizTarget={isWordInQuizTarget}
          isWordReviewLocked={isWordReviewLocked}
          onToggleVocabHelp={() => setShowVocabHelp((v) => !v)}
          onResumeTeacherQuiz={() => resumeTeacherQuizFlashcard()}
          onStartTeacherQuiz={() => {
            startTeacherQuizWithRandomMode();
          }}
          onViewLastCheckedWord={() => {
            setShowDailyComplete(false);
            openPostCompleteLastWord();
          }}
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
          onSearchChange={(value) => {
            setSearchQuery(value);
            setPage(1);
          }}
          onKindFilterChange={(value) => {
            setKindFilter(value);
            setPage(1);
          }}
          onClearSearch={() => {
            setSearchQuery("");
            setKindFilter("all");
            setPage(1);
          }}
          onRestoreDailyRowOrder={restoreDailyRowOrder}
          onToggleStatSort={toggleStatSort}
          openRemarksWord={openRemarksWord}
          onEditRemarks={setEditingRemarksWord}
          onReadingCopy={showReadingCopyToast}
          onRefPreview={openRefPreview}
          onEditWord={setEditingWord}
          onDeleteWord={(w) => void deleteWord(w)}
          onBoostQuizPriority={
            isAdminMode ? (w) => void boostQuizPriority(w) : undefined
          }
          onPreviewQuizCard={
            isAdminMode
              ? (w) => {
                  // 预览用 wordsById；管理员端无常驻 sync，补全写库后易仍看旧缓存
                  setQuizCardPreviewWordId(w.id);
                  void loadWords({ force: true });
                }
              : undefined
          }
          onViewMnemonic={setViewingMnemonicWord}
          onRecordLevel={(wordId, level) => void tryRecordLevel(wordId, level)}
          onResumeQuiz={(wordId) => resumeTeacherQuizFlashcard(wordId)}
          onRequestQuizMode={(wordId) => startTeacherQuizWithRandomMode(wordId)}
          onStatus={setStatus}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </section>

      <JpVocabPageModals
        locale={locale}
        userId={user?.id}
        isAdminMode={isAdminMode}
        isAdmin={isAdmin}
        canOperate={canOperate}
        canManualAdd={canManualAdd}
        teacherShareUiEnabled={teacherShareUiEnabled}
        showTeacherCoachEntry={showTeacherCoachEntry}
        showExportChoice={showExportChoice}
        showResetChoice={showResetChoice}
        showManualAdd={showManualAdd}
        showRiskChart={showRiskChart}
        showDailyIntro={showDailyIntro}
        showDailyComplete={showDailyComplete}
        showShareRequestModal={showShareRequestModal}
        showTeacherQuizIntro={showTeacherQuizIntro}
        showQuizFlashcard={showQuizFlashcard}
        exporting={exporting}
        resetting={resetting}
        dailyQuizTotal={dailyQuizProgress.total}
        dailyCoachLevelCounts={dailyCoachLevelCounts}
        shareRequests={shareRequests}
        quizSession={quizSession}
        quizCardPreviewSession={quizCardPreviewSession}
        quizTargetWords={quizTargetWords}
        words={words}
        wordsById={wordsById}
        refs={refs}
        displayOrder={displayOrder}
        sessionLevel={sessionLevel}
        reviewLockedByWordId={reviewLockedByWordId}
        quizFlashcardSavingWordId={quizFlashcardSavingWordId}
        wordSyncState={wordSyncState}
        dailySeqByWordId={dailySeqByWordId}
        displayQuizProgress={displayQuizProgress}
        quizTimeWeight={quizTimeWeight}
        shareProgressMap={shareProgressMap}
        sharedTodayWordIds={sharedTodayWordIds}
        studentPeekedCurrentWord={studentPeekedCurrentWord}
        todayWeakExportWordsCount={todayWeakExportWords.length}
        copyToast={copyToast}
        viewingRemarksWord={viewingRemarksWord}
        viewingMnemonicWord={viewingMnemonicWord}
        previewRef={previewRef}
        editingRemarksWord={editingRemarksWord}
        editingWord={editingWord}
        onExportChoiceClose={() => {
          if (!exporting) setShowExportChoice(false);
        }}
        onExport={(scope) =>
          void runExport(scope, words, displayOrder, sessionLevel, dailySeqByWordId)
        }
        onExportExcel={() => void runExportExcel(words, displayOrder, quizTimeWeight)}
        onExportToCoach={() => void runCoachExport(words, sessionLevel, displayOrder)}
        onResetChoiceClose={() => setShowResetChoice(false)}
        onResetToday={resetToday}
        onResetAll={resetAll}
        onManualAddClose={() => setShowManualAdd(false)}
        onWordAdded={handleWordAdded}
        onRiskChartClose={() => setShowRiskChart(false)}
        onDailyIntroClose={() => setShowDailyIntro(false)}
        onDailyCompleteClose={() => {
          if (user) {
            markJpVocabTeacherDailyCompleteDismissed(
              user.id,
              dailyQuizProgress.total
            );
          }
          setShowDailyComplete(false);
        }}
        onDailyCompleteViewLastWord={() => {
          if (user) {
            markJpVocabTeacherDailyCompleteDismissed(
              user.id,
              dailyQuizProgress.total
            );
          }
          setShowDailyComplete(false);
          openPostCompleteLastWord();
        }}
        quizFlashcardStillOpen={showQuizFlashcard}
        onGoToCoach={
          showTeacherCoachEntry
            ? () => {
                window.location.assign(jpVocabCoachPath());
              }
            : undefined
        }
        onDismissShareRequests={() => void dismissShareRequests()}
        onTeacherQuizIntroConfirm={handleTeacherQuizIntroConfirm}
        onTeacherQuizIntroClose={handleTeacherQuizIntroClose}
        onQuizFlashcardClose={closeTeacherQuizFlashcard}
        onQuizComplete={finishTeacherQuiz}
        onRecordLevel={(wordId, level) => void recordLevel(wordId, level, "flashcard")}
        onQuizNavigate={(index) =>
          setQuizSession((prev) => (prev ? { ...prev, currentIndex: index } : prev))
        }
        onOpenRef={openRefPreview}
        onOpenRemarks={openRemarksWord}
        onEditRemarks={setEditingRemarksWord}
        onEditWord={setEditingWord}
        onShare={(wordId) => void shareWord(wordId)}
        onEnsureSharedBeforeNext={ensureWordSharedBeforeNext}
        onUnshare={(wordId) => void unshareWord(wordId)}
        onWordSaved={handleWordSaved}
        onWordSaveFailed={handleWordSaveFailed}
        onRefUpdated={(ref) => {
          setRefs((prev) => ({ ...prev, [ref.ref_key]: ref }));
        }}
        onNeedAuth={openJpAuth}
        onSharedToStudy={(wordId) => {
          setSharedTodayWordIds((prev) => new Set([...prev, wordId]));
        }}
        onCloseQuizPreview={closeQuizCardPreview}
        onNavigateQuizPreview={navigateQuizCardPreview}
        onCloseViewingRemarks={() => setViewingRemarksWord(null)}
        onCloseViewingMnemonic={() => setViewingMnemonicWord(null)}
        onClosePreviewRef={() => setPreviewRef(null)}
        onCloseEditingRemarks={() => setEditingRemarksWord(null)}
        onCloseEditingWord={() => setEditingWord(null)}
        onCopyToastDismiss={() => setCopyToast(null)}
      />

      <JpVocabPageStyles />
      <MobileScrollToTopButton />
    </main>
  );
}
