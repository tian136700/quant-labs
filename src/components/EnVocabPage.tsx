"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  enVocabPath,
  enVocabAdminPath,
  enVocabStudyPath,
} from "@/lib/locale-path";
import { EN_VOCAB_TEACHER_SHARE_ENABLED } from "@/lib/en-vocab-share-ui";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  sortEnVocabWordsForDisplay,
  type EnVocabStatSortKey,
} from "@/lib/en-vocab-shared";
import {
  buildEnVocabDailySeqMap,
  type EnVocabDailyDisplayOrder,
} from "@/lib/en-vocab-daily-order";
import {
  filterEnVocabWordsBySearch,
  type EnVocabKindFilter,
} from "@/lib/en-vocab-search";
import { EnVocabPageHelp } from "@/components/en-vocab-page/EnVocabPageHelp";
import { EnVocabPageModals } from "@/components/en-vocab-page/EnVocabPageModals";
import { EnVocabPageSearch } from "@/components/en-vocab-page/EnVocabPageSearch";
import { EnVocabPageStyles } from "@/components/en-vocab-page/EnVocabPageStyles";
import { EnVocabPageToolbar } from "@/components/en-vocab-page/EnVocabPageToolbar";
import { EnVocabPagination } from "@/components/en-vocab-page/EnVocabPagination";
import { EnVocabTeacherQuizResumePanel } from "@/components/en-vocab-page/EnVocabTeacherQuizResumePanel";
import { EnVocabWordTable } from "@/components/en-vocab-page/EnVocabWordTable";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import {
  shouldShowEnVocabDailyIntro,
} from "@/components/EnVocabDailyQuizIntroModal";
import { JpVocabDailyQuizProgressBar } from "@/components/JpVocabDailyQuizProgressBar";
import {
  effectiveTodayCheckCount,
  enVocabTodayCheckStats,
} from "@/lib/en-vocab-daily-check";
import { effectiveEnVocabDisplayLevel } from "@/lib/en-vocab-review";
import {
  EN_VOCAB_PAGE_SIZE,
} from "@/lib/en-vocab-page-constants";
import {
  enVocabCheckedInRound,
  enVocabWordsInOrder,
  pickRandomEnVocabWord,
} from "@/lib/en-vocab-page-helpers";
import { sortEnVocabQuizTargetWordsByDailySeq } from "@/lib/en-vocab-teacher-quiz";
import { isEnVocabWordInTeacherVisiblePool } from "@/lib/en-vocab-teacher-visible";
import {
  computeEnVocabDailyQuizProgress,
  computeEnVocabTeacherPageQuizProgress,
} from "@/lib/en-vocab-daily-quiz-progress";
import { resolveEnVocabRefForPreview } from "@/lib/en-vocab-ref-shared";
import { persistEnVocabPageCache } from "@/lib/en-vocab-page-cache";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import { useEnVocabAdminActions } from "@/hooks/useEnVocabAdminActions";
import { useEnVocabPageSync } from "@/hooks/useEnVocabPageSync";
import { useEnVocabReviewActions } from "@/hooks/useEnVocabReviewActions";
import { useEnVocabTeacherQuiz } from "@/hooks/useEnVocabTeacherQuiz";

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
  const [sessionLevel, setSessionLevel] = useState<
    Record<number, EnVocabLevel | undefined>
  >({});
  const [sessionUsageLevels, setSessionUsageLevels] = useState<
    Record<number, Array<EnVocabLevel | null | undefined>>
  >({});
  const [sessionReviewAt, setSessionReviewAt] = useState<Record<number, number>>({});
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
  const [useDailyRowOrder, setUseDailyRowOrder] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<EnVocabKindFilter>("all");
  const [page, setPage] = useState(1);
  const [showRiskChart, setShowRiskChart] = useState(false);
  const [showDailyIntro, setShowDailyIntro] = useState(false);
  const [showVocabHelp, setShowVocabHelp] = useState(false);
  const editingRemarksIdRef = useRef<number | null>(null);
  const sharedTodayWordIdsRef = useRef<Set<number>>(new Set());
  const scrollToHighlightRef = useRef(false);

  const {
    words,
    setWords,
    refs,
    setRefs,
    displayOrder,
    setDisplayOrder,
    loading,
    refreshing,
    sharedTodayWordIds,
    setSharedTodayWordIds,
    teacherVisibleLimit,
    setTeacherVisibleLimit,
    displayOrderRef,
    refsRef,
    persistCache,
  } = useEnVocabPageSync({
    checking,
    user,
    editingRemarksWordId: editingRemarksWord?.id ?? null,
    editingWordId: editingWord?.id ?? null,
    setViewingRemarksWord,
    onLoadError: setError,
  });

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

  const displayedWords = useMemo(() => {
    if (useDailyRowOrder && displayOrder.ids.length > 0) {
      return enVocabWordsInOrder(words, displayOrder.ids);
    }
    return sortEnVocabWordsForDisplay(words, statSort);
  }, [words, statSort, displayOrder.ids, useDailyRowOrder]);

  const dailySeqByWordId = useMemo(
    () => buildEnVocabDailySeqMap(displayOrder.ids),
    [displayOrder.ids]
  );

  const quizTarget = Math.min(
    Math.max(0, teacherVisibleLimit.quiz_target),
    Math.max(0, words.length)
  );

  const quizTargetWords = useMemo(() => {
    const pool = displayedWords.filter((w) =>
      isEnVocabWordInTeacherVisiblePool(w.id, teacherVisibleLimit, dailySeqByWordId)
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
    wordsById,
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
  });

  const isWordInQuizTarget = useCallback(
    (wordId: number) => quizTargetWordIds.has(wordId),
    [quizTargetWordIds]
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

  const teacherPendingWordIds = useMemo(
    () => new Set(teacherPendingWords.map((w) => w.id)),
    [teacherPendingWords]
  );

  const displayQuizProgress = useMemo(() => {
    if (isAdminMode) return dailyQuizProgress;
    return computeEnVocabTeacherPageQuizProgress(
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

  const hideTeacherQuizList =
    canOperate &&
    !isAdminMode &&
    teacherQuizInProgress &&
    !dailyQuizProgress.complete &&
    !displayQuizProgress.complete;

  useEffect(() => {
    if (!canOperate || isAdminMode || !quizSession) return;
    if (!dailyQuizProgress.complete && !displayQuizProgress.complete) return;
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
    savingId,
    sharingId,
    reviewLockedByWordId,
    recordLevel,
    recordUsageLevels,
    shareWord,
  } = useEnVocabReviewActions({
    locale,
    canOperate,
    teacherShareUiEnabled,
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
  });

  const searchActive = searchQuery.trim().length > 0;
  const filterActive = searchActive || kindFilter !== "all";
  const hideInoperableRows = canOperate && !isAdminMode;

  const searchMatchedWords = useMemo(
    () => filterEnVocabWordsBySearch(displayedWords, searchQuery, kindFilter),
    [displayedWords, searchQuery, kindFilter]
  );

  const isEnVocabWordCheckedToday = useCallback(
    (word: EnVocabWord, now = new Date()) => {
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
    },
    [displayOrder]
  );

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

  const totalPages = Math.max(
    1,
    Math.ceil(filteredDisplayedWords.length / EN_VOCAB_PAGE_SIZE)
  );
  const safePage = Math.min(page, totalPages);
  const pagedDisplayedWords = useMemo(() => {
    const start = (safePage - 1) * EN_VOCAB_PAGE_SIZE;
    return filteredDisplayedWords.slice(start, start + EN_VOCAB_PAGE_SIZE);
  }, [filteredDisplayedWords, safePage]);
  const pagedDeleteIds = useMemo(
    () => pagedDisplayedWords.map((w) => w.id),
    [pagedDisplayedWords]
  );
  const allPageDeleteSelected =
    pagedDeleteIds.length > 0 &&
    pagedDeleteIds.every((id) => selectedDeleteIds.has(id));
  const somePageDeleteSelected =
    !allPageDeleteSelected && pagedDeleteIds.some((id) => selectedDeleteIds.has(id));
  const showPagination = filteredDisplayedWords.length > EN_VOCAB_PAGE_SIZE;
  const pageRangeStart =
    filteredDisplayedWords.length === 0
      ? 0
      : (safePage - 1) * EN_VOCAB_PAGE_SIZE + 1;
  const pageRangeEnd = Math.min(
    safePage * EN_VOCAB_PAGE_SIZE,
    filteredDisplayedWords.length
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, kindFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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

  const todayCheckStats = useMemo(() => enVocabTodayCheckStats(words), [words]);

  const openRemarksWord = useCallback(
    (word: EnVocabWord) => {
      if (canOperate) setEditingRemarksWord(word);
      else setViewingRemarksWord(word);
    },
    [canOperate]
  );

  const pickNext = () => {
    const next = pickRandomEnVocabWord(words, highlightId ?? undefined);
    if (!next) return;
    const idx = filteredDisplayedWords.findIndex((w) => w.id === next.id);
    if (idx >= 0) {
      setPage(Math.floor(idx / EN_VOCAB_PAGE_SIZE) + 1);
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
    setStatus(`已添加：${added.word}${refDeduped ? "（共用教案链接）" : ""}`);
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
    [refs, setWords, displayOrderRef]
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
    [refs, setWords, displayOrderRef]
  );

  const openRefPreview = (refKey: string, ref?: EnVocabRef) => {
    const meta = resolveEnVocabRefForPreview(refKey, refs, ref);
    setPreviewRef({
      ref: meta,
      cacheVersion: ref?.updated_at ?? refs[refKey]?.updated_at,
    });
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
    <main
      className="page-wrap jp-vocab-page"
      style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}
    >
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
          onResumeOrStartQuiz={() => {
            if (teacherQuizInProgress) {
              resumeTeacherQuizFlashcard();
              setStatus("继续今日抽查…");
              return;
            }
            startTeacherQuizWithRandomMode();
          }}
          onPickNext={pickNext}
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
          <p
            style={{
              color: "var(--muted)",
              fontSize: "0.875rem",
              marginBottom: "0.75rem",
            }}
          >
            {status}
          </p>
        ) : null}

        {!loading && words.length ? (
          <EnVocabPageHelp
            locale={locale}
            expanded={showVocabHelp}
            onToggle={() => setShowVocabHelp((v) => !v)}
          />
        ) : null}

        {loading ? (
          <p style={{ color: "var(--muted)" }}>加载中…</p>
        ) : !words.length ? (
          <p style={{ color: "var(--muted)" }}>
            暂无条目。复习词表由「英语新课」自动导入
            {canManualAdd ? "，也可登录后点「手动添加」补充" : ""}。
          </p>
        ) : hideTeacherQuizList ? (
          <EnVocabTeacherQuizResumePanel
            showQuizFlashcard={showQuizFlashcard}
            onResume={() => resumeTeacherQuizFlashcard()}
          />
        ) : (
          <>
            <EnVocabPageSearch
              loading={loading}
              searchQuery={searchQuery}
              kindFilter={kindFilter}
              filterActive={filterActive}
              searchActive={searchActive}
              filteredCount={filteredDisplayedWords.length}
              displayedCount={displayedWords.length}
              onSearchChange={setSearchQuery}
              onKindFilterChange={setKindFilter}
              onClear={() => {
                setSearchQuery("");
                setKindFilter("all");
              }}
            />
            {filteredDisplayedWords.length ? (
              <>
                <EnVocabPagination
                  show={showPagination}
                  safePage={safePage}
                  totalPages={totalPages}
                  pageRangeStart={pageRangeStart}
                  pageRangeEnd={pageRangeEnd}
                  totalItems={filteredDisplayedWords.length}
                  onPageChange={setPage}
                />
                <EnVocabWordTable
                  locale={locale}
                  loading={loading}
                  isAdmin={isAdminMode}
                  canOperate={canOperate}
                  teacherShareUiEnabled={teacherShareUiEnabled}
                  statSort={statSort}
                  onStatSort={toggleStatSort}
                  words={pagedDisplayedWords}
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
                  onPreviewQuizCard={setQuizCardPreviewWordId}
                  onDeleteWord={(w) => void deleteWord(w)}
                  onShareWord={(wordId) => void shareWord(wordId)}
                  onRecordLevel={(wordId, level) => void recordLevel(wordId, level)}
                  onResumeQuiz={(wordId) => resumeTeacherQuizFlashcard(wordId)}
                  onRequestQuizMode={(wordId) =>
                    startTeacherQuizWithRandomMode(wordId)
                  }
                  onStatus={setStatus}
                />
                <EnVocabPagination
                  show={showPagination}
                  safePage={safePage}
                  totalPages={totalPages}
                  pageRangeStart={pageRangeStart}
                  pageRangeEnd={pageRangeEnd}
                  totalItems={filteredDisplayedWords.length}
                  onPageChange={setPage}
                />
              </>
            ) : null}
          </>
        )}
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
        onTeacherQuizIntroConfirm={handleTeacherQuizIntroConfirm}
        onTeacherQuizIntroClose={handleTeacherQuizIntroClose}
        onQuizFlashcardClose={() => setShowQuizFlashcard(false)}
        onQuizComplete={finishTeacherQuiz}
        onRecordLevel={(wordId, level) => void recordLevel(wordId, level)}
        onRecordUsageLevels={(wordId, levels) =>
          void recordUsageLevels(wordId, levels)
        }
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
