"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  enVocabPath,
  enVocabAdminPath,
  enVocabStudyPath,
} from "@/lib/locale-path";
import { EN_VOCAB_TEACHER_SHARE_ENABLED } from "@/lib/en-vocab-share-ui";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  enVocabPriorityLabel,
  sortEnVocabWordsForDisplay,
  type EnVocabStatSortKey,
} from "@/lib/en-vocab-shared";
import {
  buildEnVocabDailySeqMap,
  markEnVocabRoundChecked,
  type EnVocabDailyDisplayOrder,
} from "@/lib/en-vocab-daily-order";
import {
  type EnVocabKindFilter,
} from "@/lib/en-vocab-search";
import { EnVocabPageStyles } from "@/components/en-vocab-page/EnVocabPageStyles";
import { EnVocabPageModals } from "@/components/en-vocab-page/EnVocabPageModals";
import { EnVocabPageToolbar } from "@/components/en-vocab-page/EnVocabPageToolbar";
import { EnVocabPageWordList } from "@/components/en-vocab-page/EnVocabPageWordList";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { shouldShowEnVocabDailyIntro } from "@/components/EnVocabDailyQuizIntroModal";
import { JpVocabDailyQuizProgressBar } from "@/components/JpVocabDailyQuizProgressBar";
import {
  JP_VOCAB_CACHE_KEY,
  JP_VOCAB_REFRESH_TTL_MS,
  parseEnVocabApi,
  type EnVocabApiPayload,
} from "@/lib/en-api-cache";
import {
  fetchWithClientCache,
  readClientCache,
  readClientCacheAge,
  writeClientCache,
} from "@/lib/client-swr-cache";
import { enVocabSaveQueue } from "@/lib/request-queue";
import {
  JP_VOCAB_POLL_MS,
  JP_VOCAB_POLL_HIDDEN_MS,
  maxEnVocabUpdatedAt,
  mergeEnVocabSyncPatches,
} from "@/lib/en-vocab-sync";
import { JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT } from "@/lib/en-vocab-daily-quiz-style";
import {
  enVocabTodayCheckStats,
} from "@/lib/en-vocab-daily-check";
import {
  aggregateEnVocabUsageLevels,
  applyEnVocabReview,
  areEnVocabUsageLevelsComplete,
  effectiveEnVocabDisplayLevel,
  isEnVocabWordReviewLocked,
  parseEnVocabLastUsageLevels,
  serializeEnVocabLastUsageLevels,
} from "@/lib/en-vocab-review";
import { listEnVocabUsagePointsForDisplay } from "@/lib/en-vocab-usage-examples-display";
import {
  SHOW_RANDOM_HIGHLIGHT,
  SHOW_RISK_CHART,
} from "@/lib/en-vocab-page-constants";
import {
  enVocabWordsInOrder,
  pickRandomEnVocabWord,
  readStoredEnVocabPage,
  readStoredEnVocabPageSize,
  writeStoredEnVocabPage,
  writeStoredEnVocabPageSize,
} from "@/lib/en-vocab-page-helpers";
import { clearEnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz-storage";
import { resolveEnVocabRefForPreview } from "@/lib/en-vocab-ref-shared";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import { useEnVocabPageSync } from "@/hooks/useEnVocabPageSync";
import { useEnVocabBindRemoteResetSessionClear } from "@/hooks/useEnVocabRemoteResetSessionClear";
import {
  useEnVocabQuizTargetPool,
  useEnVocabTeacherListView,
} from "@/hooks/useEnVocabTeacherListView";
import { useEnVocabReviewActions } from "@/hooks/useEnVocabReviewActions";
import { useEnVocabDailyCompleteEffects } from "@/hooks/useEnVocabDailyCompleteEffects";
import { useEnVocabTeacherQuiz } from "@/hooks/useEnVocabTeacherQuiz";
import { useEnVocabAdminActions } from "@/hooks/useEnVocabAdminActions";
import { markEnVocabTeacherDailyCompleteDismissed } from "@/lib/en-vocab-daily-complete-dismiss";
import {
  readEnVocabPageCache,
  persistEnVocabPageCache,
} from "@/lib/en-vocab-page-cache";


type EnVocabPageVariant = "teacher" | "admin";

type EnVocabPageProps = {
  variant: EnVocabPageVariant;
};

export function EnVocabPage({ variant }: EnVocabPageProps) {
  const { locale } = useI18n();
  const router = useRouter();
  const {
    user,
    setUser,
    checking,
    canAccessEnVocab,
    canAccessEnVocabTeacherPage,
    canAccessEnVocabAdminPage,
    canAccessEnVocabStudy,
    refresh,
    openAuthPanel,
    isAdmin,
    hasPermission,
  } = useEtrAuth();
  /** 产品模式：由路由 variant 驱动，不再用 isAdmin 兼做老师/管理员 UX */
  const isAdminMode = variant === "admin";
  const isTeacherMode = variant === "teacher";
  const canOperate = canAccessEnVocab;
  const canManualAdd = hasPermission("en_vocab:manual_add");
  const teacherShareUiEnabled =
    EN_VOCAB_TEACHER_SHARE_ENABLED && isTeacherMode && canOperate;

  const openEnAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 英语单词",
      subtitle: "登录用户方可修改数据。",
    });
  }, [openAuthPanel]);

  useEffect(() => {
    if (checking || !user) return;
    if (variant === "teacher" && isAdmin) {
      router.replace(enVocabAdminPath());
      return;
    }
    if (variant === "admin" && !canAccessEnVocabAdminPage) {
      router.replace(
        canAccessEnVocabTeacherPage ? enVocabPath() : enVocabStudyPath()
      );
    }
  }, [
    checking,
    user,
    variant,
    isAdmin,
    canAccessEnVocabAdminPage,
    canAccessEnVocabTeacherPage,
    router,
  ]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  /** 本轮复习：每词当前勾选（仅前端，重置后清空） */
  const [sessionLevel, setSessionLevel] = useState<
    Record<number, EnVocabLevel | undefined>
  >({});
  /** 本轮按用法勾选草稿 / 已选 */
  const [sessionUsageLevels, setSessionUsageLevels] = useState<
    Record<number, Array<EnVocabLevel | null | undefined>>
  >({});
  /** 本轮每词最近一次勾选时间（毫秒，用于 15 秒内改选修正 + 1 小时锁定） */
  const [sessionReviewAt, setSessionReviewAt] = useState<Record<number, number>>({});
  /** 每分钟刷新，使「勾选满 1 小时」锁能自动生效 */
  const [reviewLockNow, setReviewLockNow] = useState(() => Date.now());
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [editingWord, setEditingWord] = useState<EnVocabWord | null>(null);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<EnVocabWord | null>(null);
  const [viewingMnemonicWord, setViewingMnemonicWord] = useState<EnVocabWord | null>(null);
  const [viewingUsageWord, setViewingUsageWord] = useState<EnVocabWord | null>(null);
  const [previewRef, setPreviewRef] = useState<{
    ref: EnVocabRef;
    cacheVersion?: string | null;
  } | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<EnVocabWord | null>(null);
  const [statSort, setStatSort] = useState<{
    key: EnVocabStatSortKey;
    dir: "asc" | "desc";
  }>(() => JP_VOCAB_DEFAULT_STAT_SORT);
  /** 未手动点列头排序时，行顺序用当日固定 display_order；点过后按列头数值排序 */
  const [useDailyRowOrder, setUseDailyRowOrder] = useState(true);
  /** 服务端持久化的当日行顺序（北京时间 0 点重排，当天内刷新/勾选不变） */
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<EnVocabKindFilter>("all");
  const [page, setPage] = useState(() => readStoredEnVocabPage());
  const [pageSize, setPageSize] = useState(() => readStoredEnVocabPageSize());
  const [showRiskChart, setShowRiskChart] = useState(false);
  const [showDailyIntro, setShowDailyIntro] = useState(false);
  const [showDailyComplete, setShowDailyComplete] = useState(false);
  const [showVocabHelp, setShowVocabHelp] = useState(false);
  const editingRemarksIdRef = useRef<number | null>(null);
  const editingWordIdRef = useRef<number | null>(null);
  const sharedTodayWordIdsRef = useRef<Set<number>>(new Set());
  const scrollToHighlightRef = useRef(false);
  const [teacherQuizPollActive, setTeacherQuizPollActive] = useState(false);

  const onRemoteResetClearSessionRef = useRef<(() => void) | null>(null);

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
    displayOrderRef,
    refsRef,
    persistCache,
    loadWords,
  } = useEnVocabPageSync({
    checking,
    user,
    editingRemarksWordId: editingRemarksWord?.id ?? null,
    editingWordId: editingWord?.id ?? null,
    setViewingRemarksWord,
    onLoadError: setError,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    onRemoteResetClearSessionRef,
    enableBackgroundSyncPoll: isTeacherMode && teacherQuizPollActive,
  });

  const handleRefreshWords = useCallback(() => {
    void loadWords({ force: true });
  }, [loadWords]);

  useEffect(() => {
    editingRemarksIdRef.current = editingRemarksWord?.id ?? null;
  }, [editingRemarksWord?.id]);
  useEffect(() => {
    editingWordIdRef.current = editingWord?.id ?? null;
  }, [editingWord?.id]);
  useEffect(() => {
    sharedTodayWordIdsRef.current = sharedTodayWordIds;
  }, [sharedTodayWordIds]);

  useEffect(() => {
    const timer = setInterval(() => setReviewLockNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const {
    resetting,
    showResetChoice,
    setShowResetChoice,
    quizTargetInput,
    setQuizTargetInput,
    settingQuizTarget,
    exporting,
    deletingBatch,
    selectedDeleteIds,
    setDailyQuizTarget,
    openResetChoice,
    resetToday,
    resetAll,
    exportExcel,
    toggleDeleteSelection,
    toggleSelectAllPageForDelete,
    batchDeleteSelected,
    deleteWord,
  } = useEnVocabAdminActions({
    locale,
    isAdminMode,
    canOperate,
    openEnAuth,
    setStatus,
    setError,
    words,
    refs,
    refsRef,
    displayOrderRef,
    teacherVisibleLimit,
    highlightId,
    editingWord,
    userId: user?.id ?? null,
    setWords,
    setDisplayOrder,
    setSharedTodayWordIds,
    setTeacherVisibleLimit,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    setHighlightId,
    setEditingWord,
    setUseDailyRowOrder,
    setStatSort,
    setPage,
    onResetClearTeacherQuizUi: () => {
      onRemoteResetClearSessionRef.current?.();
    },
  });



  const toggleStatSort = (key: EnVocabStatSortKey) => {
    setUseDailyRowOrder(false);
    setPage(1);
    setStatSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      return { key, dir: "desc" };
    });
  };

  /** 当日固定序号：来自服务端 display_order，不随列头排序变化 */
  const dailySeqByWordId = useMemo(
    () => buildEnVocabDailySeqMap(displayOrder.ids),
    [displayOrder.ids]
  );

  const displayedWords = useMemo(() => {
    if (useDailyRowOrder && displayOrder.ids.length > 0) {
      return enVocabWordsInOrder(words, displayOrder.ids);
    }
    return sortEnVocabWordsForDisplay(words, statSort, { dailySeqByWordId });
  }, [words, statSort, displayOrder.ids, useDailyRowOrder, dailySeqByWordId]);

  const {
    quizTarget,
    quizTargetWords,
    quizTargetWordIds,
    dailyQuizProgress,
  } = useEnVocabQuizTargetPool({
    displayedWords,
    words,
    teacherVisibleLimit,
    dailySeqByWordId,
  });

  const { onTeacherQuizSessionFinished } = useEnVocabDailyCompleteEffects({
    userId: user?.id,
    isAdminMode,
    canOperate,
    loading,
    checking,
    wordsLength: words.length,
    dailyQuizProgress,
    setShowDailyComplete,
  });

  const {
    quizSession,
    setQuizSession,
    showQuizFlashcard,
    setShowQuizFlashcard,
    studentPeekedCurrentWord,
    setStudentPeekedCurrentWord,
    showTeacherQuizIntro,
    pendingTeacherQuizSession,
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
  } = useEnVocabTeacherQuiz({
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
    dailyQuizProgress,
    setSharedTodayWordIds,
    setStatus,
    onTeacherQuizSessionFinished,
    onTeacherQuizPollActiveChange: setTeacherQuizPollActive,
  });

  useEnVocabBindRemoteResetSessionClear(onRemoteResetClearSessionRef, {
    userId: user?.id,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    setQuizSession,
    setShowQuizFlashcard,
  });

  const {
    displayQuizProgress,
    searchActive,
    filterActive,
    hideInoperableRows,
    filteredDisplayedWords,
  } = useEnVocabTeacherListView({
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
  });

  const isWordInQuizTarget = useCallback(
    (wordId: number) => quizTargetWordIds.has(wordId),
    [quizTargetWordIds]
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredDisplayedWords.length / pageSize)
  );
  const safePage = Math.min(page, totalPages);
  const pagedDisplayedWords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredDisplayedWords.slice(start, start + pageSize);
  }, [filteredDisplayedWords, safePage, pageSize]);
  const pagedDeleteIds = useMemo(
    () => pagedDisplayedWords.map((w) => w.id),
    [pagedDisplayedWords]
  );
  const allPageDeleteSelected =
    pagedDeleteIds.length > 0 &&
    pagedDeleteIds.every((id) => selectedDeleteIds.has(id));
  const somePageDeleteSelected =
    !allPageDeleteSelected && pagedDeleteIds.some((id) => selectedDeleteIds.has(id));
  const pageRangeStart =
    filteredDisplayedWords.length === 0
      ? 0
      : (safePage - 1) * pageSize + 1;
  const pageRangeEnd = Math.min(
    safePage * pageSize,
    filteredDisplayedWords.length
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, kindFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    writeStoredEnVocabPage(safePage);
  }, [safePage]);

  useEffect(() => {
    writeStoredEnVocabPageSize(pageSize);
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

  const anyCheckedInRound = useMemo(
    () => (displayOrder.round_checked_ids ?? []).length > 0,
    [displayOrder.round_checked_ids]
  );

  useEffect(() => {
    if (loading || checking || !canOperate || isAdminMode || !words.length) return;
    if (anyCheckedInRound) return;
    if (!shouldShowEnVocabDailyIntro()) return;
    setShowDailyIntro(true);
  }, [loading, checking, canOperate, isAdminMode, words.length, anyCheckedInRound]);

  const unmarkedCount = useMemo(
    () =>
      quizTargetWords.filter(
        (w) =>
          !effectiveEnVocabDisplayLevel(w, sessionLevel[w.id], { displayOrder })
      ).length,
    [quizTargetWords, sessionLevel, displayOrder]
  );

  const wordsById = useMemo(
    () => new Map(words.map((w) => [w.id, w])),
    [words]
  );

  const {
    savingId,
    sharingId,
    reviewLockedByWordId,
    wordSyncState,
    shareProgressMap,
    recordLevel,
    recordUsageLevels,
    shareWord,
  } = useEnVocabReviewActions({
    locale,
    canOperate,
    teacherShareUiEnabled,
    studentPeekedCurrentWord,
    displayOrder,
    displayOrderRef,
    sharedTodayWordIdsRef,
    words,
    refs,
    sessionLevel,
    sessionUsageLevels,
    sessionReviewAt,
    reviewLockNow,
    sharedTodayWordIds,
    setWords,
    setDisplayOrder,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    setSharedTodayWordIds,
    setHighlightId,
    setStatus,
    openEnAuth,
    refresh,
    persistCache,
  });


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

  useEffect(() => {
    if (!canOperate || isAdminMode || !quizSession) return;
    if (!dailyQuizProgress.complete && !displayQuizProgress.complete) {
      return;
    }
    setShowQuizFlashcard(false);
    setQuizSession(null);
    if (user?.id) clearEnVocabTeacherQuizSession(user.id);
  }, [
    canOperate,
    isAdminMode,
    quizSession,
    dailyQuizProgress.complete,
    displayQuizProgress.complete,
    user?.id,
    setShowQuizFlashcard,
    setQuizSession,
  ]);

  const openRemarksWord = useCallback(
    (word: EnVocabWord) => {
      if (canOperate) setEditingRemarksWord(word);
      else setViewingRemarksWord(word);
    },
    [canOperate]
  );

  const todayCheckStats = useMemo(
    () => enVocabTodayCheckStats(words),
    [words]
  );
  const pickNext = () => {
    const next = pickRandomEnVocabWord(words, highlightId ?? undefined);
    if (!next) return;
    const idx = filteredDisplayedWords.findIndex((w) => w.id === next.id);
    if (idx >= 0) {
      setPage(Math.floor(idx / pageSize) + 1);
    }
    scrollToHighlightRef.current = true;
    setHighlightId(next.id);
  };

  const handleWordAdded = (
    added: EnVocabWord,
    ref?: EnVocabRef,
    refDeduped?: boolean
  ) => {
    const nextWords = [...words, added];
    const nextRefs = ref
      ? { ...refs, [ref.ref_key]: { ...refs[ref.ref_key], ...ref } }
      : refs;
    const nextDisplayOrder: EnVocabDailyDisplayOrder = displayOrder.ids.includes(
      added.id
    )
      ? displayOrder
      : { ...displayOrder, ids: [...displayOrder.ids, added.id] };
    setWords(nextWords);
    setRefs(nextRefs);
    setDisplayOrder(nextDisplayOrder);
    persistEnVocabPageCache(nextWords, nextRefs, nextDisplayOrder);
    setStatus(
      `已添加：${added.word}${refDeduped ? "（共用教案链接）" : ""}`
    );
  };

  const handleWordSaved = useCallback(
    (word: EnVocabWord) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === word.id ? word : w));
        persistEnVocabPageCache(next, refs, displayOrderRef.current);
        return next;
      });
      setEditingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
      if (editingRemarksIdRef.current !== word.id) {
        setStatus("词条已保存。");
      }
    },
    [refs]
  );

  const handleWordSaveFailed = useCallback(
    (wordId: number, snapshot: EnVocabWord, message: string) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === wordId ? snapshot : w));
        persistEnVocabPageCache(next, refs, displayOrderRef.current);
        return next;
      });
      setStatus(message);
    },
    [refs]
  );

  const openRefPreview = (refKey: string, ref?: EnVocabRef) => {
    const meta = resolveEnVocabRefForPreview(refKey, refs, ref);
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
        title="登录 · 英语单词"
        subtitle="请登录后继续访问英语抽背（需账号密码，不对普通网友开放）。"
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

  if (
    (isAdminMode && !canAccessEnVocabAdminPage) ||
    (isTeacherMode && !canAccessEnVocabTeacherPage)
  ) {
    return (
      <main
        className="page-wrap jp-vocab-page"
        style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>
          {isAdminMode ? "英语抽背-管理员端" : "英语抽背-老师端"}
        </h1>
        <p role="alert" style={{ color: "var(--rise)", marginBottom: "0.75rem" }}>
          当前账号无权访问此页面，请联系管理员在「角色权限管理」中开通对应权限。
        </p>
        {canAccessEnVocabStudy ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            你可前往{" "}
            <a href={enVocabStudyPath()} style={{ color: "var(--accent)" }}>
              今日英语单词
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
        {isAdminMode ? "英语抽背-管理员端" : "英语抽背-老师端"}
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        {teacherShareUiEnabled ? (
          <>
            扫一眼单词或语法表，学生回答后勾选熟悉程度；答不出或不熟悉时可「共享」到今日英语单词。
          </>
        ) : isAdminMode ? (
          <>
            管理全库词条、设置今日抽查数量与导出。老师端按可见池抽查；学生端可通过「查看老师正在抽查的单词」获取当前词。
          </>
        ) : (
          <>扫一眼单词或语法表，学生回答后勾选熟悉程度。</>
        )}
      </p>

      {error ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
        </p>
      ) : null}

      {canOperate &&
      (displayQuizProgress.total > 0 ||
        displayQuizProgress.complete ||
        isAdminMode) ? (
        <JpVocabDailyQuizProgressBar
          progress={displayQuizProgress as JpVocabDailyQuizProgress}
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
        />
      ) : null}

      <section className="section etr-panel" aria-label="单词表">
        <EnVocabPageToolbar
          isAdminMode={isAdminMode}
          canOperate={canOperate}
          canManualAdd={canManualAdd}
          loading={loading}
          refreshing={refreshing}
          wordsCount={words.length}
          unmarkedCount={unmarkedCount}
          todayCheckStats={todayCheckStats}
          quizTarget={quizTarget}
          quizTargetWordsLength={quizTargetWords.length}
          teacherQuizInProgress={teacherQuizInProgress}
          exporting={exporting}
          deletingBatch={deletingBatch}
          resetting={resetting}
          selectedDeleteCount={selectedDeleteIds.size}
          onRefresh={() => handleRefreshWords()}
          onResumeOrStartQuiz={() => {
            if (teacherQuizInProgress) {
              resumeTeacherQuizFlashcard();
              setStatus("继续今日抽查…");
              return;
            }
            startTeacherQuizWithRandomMode();
          }}
          onPickNext={() => pickNext()}
          onExportExcel={() => void exportExcel(displayedWords, sessionLevel)}
          onShowRiskChart={() => setShowRiskChart(true)}
          onManualAdd={() => {
            if (!canOperate) {
              setStatus("请登录后再手动添加。");
              openEnAuth();
              return;
            }
            setShowManualAdd(true);
          }}
          onBatchDelete={() => void batchDeleteSelected()}
          onOpenResetChoice={openResetChoice}
        />


        {status ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            {status}
          </p>
        ) : null}

        <EnVocabPageWordList
          locale={locale}
          loading={loading}
          isAdminMode={isAdminMode}
          canOperate={canOperate}
          canManualAdd={canManualAdd}
          wordsLength={words.length}
          hideTeacherQuizList={hideTeacherQuizList}
          showQuizFlashcard={showQuizFlashcard}
          showVocabHelp={showVocabHelp}
          searchQuery={searchQuery}
          kindFilter={kindFilter}
          filterActive={filterActive}
          searchActive={searchActive}
          teacherShareUiEnabled={teacherShareUiEnabled}
          statSort={statSort}
          filteredDisplayedWords={filteredDisplayedWords}
          displayedWordsCount={displayedWords.length}
          pagedDisplayedWords={pagedDisplayedWords}
          safePage={safePage}
          totalPages={totalPages}
          pageRangeStart={pageRangeStart}
          pageRangeEnd={pageRangeEnd}
          pageSize={pageSize}
          highlightId={highlightId}
          displayOrder={displayOrder}
          sessionLevel={sessionLevel}
          savingId={savingId}
          sharingId={sharingId}
          deletingBatch={deletingBatch}
          sharedTodayWordIds={sharedTodayWordIds}
          reviewLockedByWordId={reviewLockedByWordId}
          refs={refs}
          dailySeqByWordId={dailySeqByWordId}
          quizTarget={quizTarget}
          teacherQuizLocksTable={teacherQuizLocksTable}
          isWordInQuizTarget={isWordInQuizTarget}
          quizSession={quizSession}
          selectedDeleteIds={selectedDeleteIds}
          allPageDeleteSelected={allPageDeleteSelected}
          somePageDeleteSelected={somePageDeleteSelected}
          pagedDeleteIds={pagedDeleteIds}
          onToggleVocabHelp={() => setShowVocabHelp((v) => !v)}
          onResumeTeacherQuiz={() => resumeTeacherQuizFlashcard()}
          onSearchChange={setSearchQuery}
          onKindFilterChange={setKindFilter}
          onClearSearch={() => {
            setSearchQuery("");
            setKindFilter("all");
          }}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          onStatSort={toggleStatSort}
          onToggleSelectAllPageForDelete={() =>
            toggleSelectAllPageForDelete(pagedDeleteIds, allPageDeleteSelected)
          }
          onToggleDeleteSelection={toggleDeleteSelection}
          onRefPreview={openRefPreview}
          onViewUsage={setViewingUsageWord}
          onViewMnemonic={setViewingMnemonicWord}
          onViewRemarks={setViewingRemarksWord}
          onEditRemarks={setEditingRemarksWord}
          onEditWord={setEditingWord}
          onPreviewQuizCard={(wordId) => setQuizCardPreviewWordId(wordId)}
          onDeleteWord={(w) => void deleteWord(w)}
          onShareWord={(wordId) => void shareWord(wordId)}
          onRecordLevel={(wordId, level) => void recordLevel(wordId, level)}
          onResumeQuiz={(wordId) => resumeTeacherQuizFlashcard(wordId)}
          onRequestQuizMode={(wordId) => startTeacherQuizWithRandomMode(wordId)}
          onStatus={setStatus}
        />
      </section>

      <EnVocabPageModals
        locale={locale}
        userId={user?.id}
        isAdminMode={isAdminMode}
        canOperate={canOperate}
        canManualAdd={canManualAdd}
        teacherShareUiEnabled={teacherShareUiEnabled}
        showResetChoice={showResetChoice}
        resetting={resetting}
        showManualAdd={showManualAdd}
        showRiskChart={showRiskChart}
        showDailyIntro={showDailyIntro}
        showDailyComplete={showDailyComplete}
        showTeacherQuizIntro={showTeacherQuizIntro}
        showQuizFlashcard={showQuizFlashcard}
        quizSession={quizSession}
        quizCardPreviewSession={quizCardPreviewSession}
        words={words}
        wordsById={wordsById}
        refs={refs}
        displayOrder={displayOrder}
        sessionLevel={sessionLevel}
        sessionUsageLevels={sessionUsageLevels}
        reviewLockedByWordId={reviewLockedByWordId}
        savingId={savingId}
        wordSyncState={wordSyncState}
        shareProgressMap={shareProgressMap}
        dailySeqByWordId={dailySeqByWordId}
        displayQuizProgress={displayQuizProgress}
        sharedTodayWordIds={sharedTodayWordIds}
        studentPeekedCurrentWord={studentPeekedCurrentWord}
        viewingRemarksWord={viewingRemarksWord}
        viewingMnemonicWord={viewingMnemonicWord}
        viewingUsageWord={viewingUsageWord}
        previewRef={previewRef}
        editingRemarksWord={editingRemarksWord}
        editingWord={editingWord}
        onResetChoiceClose={() => setShowResetChoice(false)}
        onResetToday={resetToday}
        onResetAll={resetAll}
        onManualAddClose={() => setShowManualAdd(false)}
        onWordAdded={handleWordAdded}
        onRiskChartClose={() => setShowRiskChart(false)}
        onDailyIntroClose={() => setShowDailyIntro(false)}
        onDailyCompleteClose={() => {
          if (user) {
            markEnVocabTeacherDailyCompleteDismissed(
              user.id,
              dailyQuizProgress.total
            );
          }
          setShowDailyComplete(false);
        }}
        onTeacherQuizIntroConfirm={handleTeacherQuizIntroConfirm}
        onTeacherQuizIntroClose={handleTeacherQuizIntroClose}
        onQuizFlashcardClose={() => setShowQuizFlashcard(false)}
        onQuizComplete={finishTeacherQuiz}
        onRecordLevel={(wordId, level) => void recordLevel(wordId, level)}
        onRecordUsageLevels={(wordId, levels) => void recordUsageLevels(wordId, levels)}
        onQuizNavigate={(index) =>
          setQuizSession((prev) => (prev ? { ...prev, currentIndex: index } : prev))
        }
        onOpenRef={openRefPreview}
        onOpenRemarks={openRemarksWord}
        onEditRemarks={setEditingRemarksWord}
        onEditWord={setEditingWord}
        onShare={(wordId) => void shareWord(wordId)}
        onWordSaved={handleWordSaved}
        onWordSaveFailed={handleWordSaveFailed}
        onNeedAuth={openEnAuth}
        onCloseQuizPreview={closeQuizCardPreview}
        onCloseViewingRemarks={() => setViewingRemarksWord(null)}
        onCloseViewingMnemonic={() => setViewingMnemonicWord(null)}
        onCloseViewingUsage={() => setViewingUsageWord(null)}
        onClosePreviewRef={() => setPreviewRef(null)}
        onCloseEditingRemarks={() => setEditingRemarksWord(null)}
        onCloseEditingWord={() => setEditingWord(null)}
      />


      <EnVocabPageStyles />

    </main>
  );
}
