"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
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
  markJpVocabRoundChecked,
  unmarkJpVocabRoundChecked,
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
import { JpVocabDailyQuizCompleteModal } from "@/components/JpVocabDailyQuizCompleteModal";
import { JpVocabShareRequestModal } from "@/components/JpVocabShareRequestModal";
import { JpVocabResetChoiceModal } from "@/components/JpVocabResetChoiceModal";
import {
  JpVocabTeacherQuizIntroModal,
  shouldShowJpVocabTeacherQuizIntro,
} from "@/components/JpVocabTeacherQuizIntroModal";
import { JpVocabTeacherQuizFlashcardModal } from "@/components/JpVocabTeacherQuizFlashcardModal";
import {
  createJpVocabTeacherQuizSession,
  expandJpVocabTeacherQuizSessionForTarget,
  filterJpVocabTeacherQuizUncheckedWords,
  findFirstUncheckedJpVocabTeacherQuizIndex,
  isJpVocabTeacherQuizSessionComplete,
  pickRandomJpVocabTeacherQuizMode,
  reconcileJpVocabTeacherQuizSession,
  resolveJpVocabTeacherQuizRefreshResumeIndex,
  resolveJpVocabTeacherQuizResumeIndex,
  type JpVocabTeacherQuizMode,
  type JpVocabTeacherQuizSession,
} from "@/lib/jp-vocab-teacher-quiz";
import {
  clearJpVocabTeacherQuizSession,
  readJpVocabTeacherQuizSession,
  writeJpVocabTeacherQuizSession,
} from "@/lib/jp-vocab-teacher-quiz-storage";
import {
  JP_VOCAB_CACHE_KEY,
  JP_VOCAB_REFRESH_TTL_MS,
  parseJpVocabApi,
  type JpVocabApiPayload,
} from "@/lib/jp-api-cache";
import {
  fetchWithClientCache,
  readClientCacheAge,
  writeClientCache,
} from "@/lib/client-swr-cache";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import {
  JP_VOCAB_POLL_MS,
  JP_VOCAB_POLL_HIDDEN_MS,
  JP_VOCAB_POLL_IDLE_COMPLETE_HIDDEN_MS,
  JP_VOCAB_POLL_IDLE_COMPLETE_MS,
  JP_VOCAB_QUIZ_LIVE_POLL_MS,
  JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_HIDDEN_MS,
  JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_MS,
  JP_VOCAB_TEACHER_VISIBLE_POLL_IDLE_COMPLETE_MS,
  JP_VOCAB_TEACHER_VISIBLE_POLL_MS,
  jpVocabPollIntervalMs,
  maxJpVocabUpdatedAt,
  mergeJpVocabSyncPatches,
} from "@/lib/jp-vocab-sync";
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
import { jpVocabCoachPath } from "@/lib/locale-path";
import {
  effectiveTodayCheckCount,
  jpVocabTodayCheckStats,
  beijingDateString,
} from "@/lib/jp-vocab-daily-check";
import {
  effectiveJpVocabDisplayLevel,
  isJpVocabWordReviewLocked,
  resolveJpVocabPreviousLevel,
} from "@/lib/jp-vocab-review";
import {
  isJpVocabWordInTeacherVisiblePool,
  isJpVocabWordQuizCheckedToday,
  listJpVocabTeacherQuizPoolWords,
  normalizeJpVocabTeacherVisibleLimit,
  teacherVisibleLimitNeedsPersist,
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
import { notifyJpVocabSharedUpdated } from "@/lib/jp-vocab-shared-notify";
import {
  notifyJpVocabQuizTargetUpdated,
  subscribeJpVocabQuizTargetUpdated,
} from "@/lib/jp-vocab-quiz-target-notify";
import { JP_VOCAB_SHARE_UI_ENABLED } from "@/lib/jp-vocab-share-ui";
import {
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
} from "@/lib/jp-vocab-save-progress";
import { JpVocabPagination } from "@/components/jp-vocab-page/JpVocabPagination";
import { JpVocabPageStyles } from "@/components/jp-vocab-page/JpVocabPageStyles";
import { JpVocabWordTable } from "@/components/jp-vocab-page/JpVocabWordTable";
import {
  readJpVocabPageCache,
  persistJpVocabPageCache,
} from "@/lib/jp-vocab-page-cache";
import {
  SHOW_RANDOM_HIGHLIGHT,
  SHOW_RISK_CHART,
} from "@/lib/jp-vocab-page-constants";
import {
  animateJpVocabShareProgressTo100,
  bumpJpVocabWordReview,
  jpVocabShareProgressPercent,
  jpVocabWordsInOrder,
  JP_VOCAB_SAVE_ERR,
  pickRandomJpVocabWord,
  readStoredJpVocabPage,
  readStoredJpVocabPageSize,
  writeStoredJpVocabPage,
  writeStoredJpVocabPageSize,
} from "@/lib/jp-vocab-page-helpers";
import type { JpVocabLevel, JpVocabRef, JpVocabShareRequest, JpVocabWord } from "@/lib/types";

const JpVocabRiskChartModal = dynamic(
  () => import("@/components/JpVocabRiskChartModal").then((m) => m.JpVocabRiskChartModal),
  { ssr: false }
);
const JpVocabExportChoiceModal = dynamic(
  () => import("@/components/JpVocabExportChoiceModal").then((m) => m.JpVocabExportChoiceModal),
  { ssr: false }
);

export function JpVocabPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const {
    user,
    checking,
    canAccessJpVocab,
    refresh,
    openAuthPanel,
    setUser,
    isAdmin,
    hasPermission,
  } = useEtrAuth();
  const canOperate = canAccessJpVocab;
  const canManualAdd = hasPermission("jp_vocab:manual_add");
  const canShareToStudy = canAccessJpVocab;

  const openJpAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 日语单词",
      subtitle: "登录用户方可修改数据。",
    });
  }, [openAuthPanel]);
  const [words, setWords] = useState<JpVocabWord[]>(() => readJpVocabPageCache()?.words ?? []);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>(
    () => readJpVocabPageCache()?.refs ?? {}
  );
  const [loading, setLoading] = useState(() => readJpVocabPageCache() == null);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetChoice, setShowResetChoice] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [wordSyncState, setWordSyncState] = useState<
    Record<number, "queued" | "syncing">
  >({});
  const [shareProgressMap, setShareProgressMap] = useState<Record<number, number>>(
    {}
  );
  const [saveQueuePending, setSaveQueuePending] = useState(0);
  const [sharedTodayWordIds, setSharedTodayWordIds] = useState<Set<number>>(
    () => new Set(readJpVocabPageCache()?.shared_today_word_ids ?? [])
  );
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
  /** 服务端持久化的当日行顺序（北京时间 0 点重排，当天内刷新/勾选不变） */
  const [displayOrder, setDisplayOrder] = useState<JpVocabDailyDisplayOrder>(() => {
    const cached = readJpVocabPageCache()?.display_order;
    return cached ?? { date: "", ids: [], round_checked_ids: [] };
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<JpVocabKindFilter>("all");
  const [page, setPage] = useState(() => readStoredJpVocabPage());
  const [pageSize, setPageSize] = useState(() => readStoredJpVocabPageSize());
  const [exporting, setExporting] = useState(false);
  const [coachNavBusy, setCoachNavBusy] = useState(false);
  const [showExportChoice, setShowExportChoice] = useState(false);
  const [showRiskChart, setShowRiskChart] = useState(false);
  const [showDailyIntro, setShowDailyIntro] = useState(false);
  const [showDailyComplete, setShowDailyComplete] = useState(false);
  const [shareRequests, setShareRequests] = useState<JpVocabShareRequest[]>([]);
  const [showShareRequestModal, setShowShareRequestModal] = useState(false);
  const shareRequestPollInFlightRef = useRef(false);
  const dismissingShareRequestsRef = useRef(false);
  const dailyCompleteSnapshotRef = useRef<JpVocabDailyCompleteSnapshot | null>(null);
  /** 抽查完成弹窗弹出时已批量写入带读的 key，避免重复打 D1 */
  const coachMergedOnCompleteKeyRef = useRef<string | null>(null);
  const [showVocabHelp, setShowVocabHelp] = useState(false);
  /** 手机端默认收起操作按钮，避免误触导出等 */
  const [mobileToolbarExpanded, setMobileToolbarExpanded] = useState(false);
  const [quizSession, setQuizSession] = useState<JpVocabTeacherQuizSession | null>(
    null
  );
  const [showQuizFlashcard, setShowQuizFlashcard] = useState(false);
  const [showTeacherQuizIntro, setShowTeacherQuizIntro] = useState(false);
  const [pendingTeacherQuizSession, setPendingTeacherQuizSession] =
    useState<JpVocabTeacherQuizSession | null>(null);
  /** 管理员预览单条抽问卡片（与老师抽问卡片同 UI） */
  const [quizCardPreviewWordId, setQuizCardPreviewWordId] = useState<number | null>(
    null
  );
  const [studentPeekedCurrentWord, setStudentPeekedCurrentWord] = useState(false);
  const teacherQuizLiveWordRef = useRef<number | null | undefined>(undefined);
  const [teacherVisibleLimit, setTeacherVisibleLimit] = useState<JpVocabTeacherVisibleLimit>(
    () =>
      readJpVocabPageCache()?.teacher_visible_limit ??
      normalizeJpVocabTeacherVisibleLimit(null)
  );
  const [quizTargetInput, setQuizTargetInput] = useState(
    () =>
      String(
        readJpVocabPageCache()?.teacher_visible_limit?.quiz_target ??
          normalizeJpVocabTeacherVisibleLimit(null).quiz_target
      )
  );
  const [settingQuizTarget, setSettingQuizTarget] = useState(false);
  const [reviewLockNow, setReviewLockNow] = useState(() => Date.now());
  const displayOrderRef = useRef(displayOrder);
  const wordsRef = useRef(words);
  const sessionLevelRef = useRef(sessionLevel);
  const refsRef = useRef(refs);
  const editingRemarksIdRef = useRef<number | null>(null);
  const editingWordIdRef = useRef<number | null>(null);
  const sharedTodayWordIdsRef = useRef(sharedTodayWordIds);
  const pollInFlightRef = useRef(false);
  /** 老师（非管理员）今日抽查已全部完成 → 轮询大幅降频，减轻 Worker 压力 */
  const teacherIdleCompleteRef = useRef(false);
  const scrollToHighlightRef = useRef(false);
  const shareProgressTimersRef = useRef<Map<number, ReturnType<typeof setInterval>>>(
    new Map()
  );

  const patchShareProgress = useCallback((wordId: number, percent: number | null) => {
    setShareProgressMap((prev) => {
      if (percent == null) {
        if (!(wordId in prev)) return prev;
        const next = { ...prev };
        delete next[wordId];
        return next;
      }
      return { ...prev, [wordId]: percent };
    });
  }, []);

  const setWordSyncPhase = useCallback(
    (wordId: number, phase: "queued" | "syncing" | null) => {
      setWordSyncState((prev) => {
        if (phase == null) {
          if (!(wordId in prev)) return prev;
          const next = { ...prev };
          delete next[wordId];
          return next;
        }
        return { ...prev, [wordId]: phase };
      });
    },
    []
  );

  const clearShareTimer = useCallback((wordId: number) => {
    const timer = shareProgressTimersRef.current.get(wordId);
    if (timer) {
      clearInterval(timer);
      shareProgressTimersRef.current.delete(wordId);
    }
  }, []);

  useEffect(() => {
    return jpVocabSaveQueue.subscribe(setSaveQueuePending);
  }, []);

  useEffect(() => {
    displayOrderRef.current = displayOrder;
  }, [displayOrder]);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);
  useEffect(() => {
    sessionLevelRef.current = sessionLevel;
  }, [sessionLevel]);
  useEffect(() => {
    refsRef.current = refs;
  }, [refs]);
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
    setQuizTargetInput(String(teacherVisibleLimit.quiz_target));
  }, [teacherVisibleLimit.quiz_target]);

  useEffect(() => {
    const timer = setInterval(() => setReviewLockNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of shareProgressTimersRef.current.values()) {
        clearInterval(timer);
      }
      shareProgressTimersRef.current.clear();
    };
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

  const applyVocabPayload = useCallback((payload: JpVocabApiPayload) => {
    setWords(payload.words);
    setRefs(payload.refs);
    setDisplayOrder(payload.display_order);
    setSharedTodayWordIds(new Set(payload.shared_today_word_ids ?? []));
    setTeacherVisibleLimit(payload.teacher_visible_limit);
  }, []);

  const applyTeacherVisibleSync = useCallback(
    (raw: Partial<JpVocabTeacherVisibleLimit> | undefined) => {
      if (!raw) return;
      const next = normalizeJpVocabTeacherVisibleLimit(raw);
      setTeacherVisibleLimit((prev) => {
        if (!teacherVisibleLimitNeedsPersist(prev, next)) {
          return prev;
        }
        const cached = readJpVocabPageCache();
        if (cached) {
          writeClientCache(JP_VOCAB_CACHE_KEY, {
            ...cached,
            teacher_visible_limit: next,
          });
        }
        return next;
      });
    },
    []
  );

  /** 从服务端拉取今日抽查目标（跨域名：finance 管理员 vs japanese 老师 localStorage 不共享，只能靠服务端） */
  const syncTeacherVisibleLimitFromServer = useCallback(async () => {
    try {
      const res = await fetch("/api/jp-vocab/teacher-visible", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok: boolean;
        teacher_visible_limit?: Partial<JpVocabTeacherVisibleLimit>;
      };
      if (data.ok) {
        applyTeacherVisibleSync(data.teacher_visible_limit);
      }
    } catch {
      /* ignore */
    }
  }, [applyTeacherVisibleSync]);

  const loadWords = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readJpVocabPageCache();
    const hasCache = cached != null;
    const cacheAge = readClientCacheAge(JP_VOCAB_CACHE_KEY);
    const cacheFresh =
      !opts?.force &&
      hasCache &&
      cacheAge != null &&
      cacheAge < JP_VOCAB_REFRESH_TTL_MS;

    if (hasCache) {
      applyVocabPayload(cached);
      setLoading(false);
      if (!cacheFresh) setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    // 词表可走本地缓存，但抽查目标必须每次从服务端拉（finance / japanese 域名 localStorage 不共享）
    void syncTeacherVisibleLimitFromServer();
    try {
      const payload = await fetchWithClientCache(
        JP_VOCAB_CACHE_KEY,
        "/api/jp-vocab",
        parseJpVocabApi,
        {
          onCached: applyVocabPayload,
          ttlMs: JP_VOCAB_REFRESH_TTL_MS,
          force: opts?.force,
        }
      );
      applyVocabPayload(payload);
    } catch (err) {
      if (!hasCache) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyVocabPayload, syncTeacherVisibleLimitFromServer]);

  useEffect(() => {
    if (checking || !user) return;
    void loadWords();
  }, [loadWords, checking, user]);

  /** 北京时间跨日后清空前端勾选回显，并拉取当日新顺序 */
  useEffect(() => {
    if (checking || !user) return;
    let today = beijingDateString();
    const onDayRollover = () => {
      const next = beijingDateString();
      if (next === today) return;
      today = next;
      setSessionLevel({});
      setSessionReviewAt({});
      setHighlightId(null);
      void loadWords({ force: true });
    };
    onDayRollover();
    const timer = window.setInterval(onDayRollover, 60_000);
    return () => window.clearInterval(timer);
  }, [loadWords, checking, user]);

  const applySyncPatches = useCallback((patches: JpVocabWord[]) => {
    if (!patches.length) return;
    setWords((prev) => {
      const next = mergeJpVocabSyncPatches(prev, patches);
      persistJpVocabPageCache(next, refsRef.current, displayOrderRef.current);
      return next;
    });
    setViewingRemarksWord((prev) => {
      if (!prev) return prev;
      const patch = patches.find((w) => w.id === prev.id);
      if (!patch || patch.updated_at <= prev.updated_at) return prev;
      return { ...prev, ...patch };
    });
  }, []);

  useEffect(() => {
    if (checking || !user) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      jpVocabPollIntervalMs(
        JP_VOCAB_POLL_MS,
        JP_VOCAB_POLL_HIDDEN_MS,
        JP_VOCAB_POLL_IDLE_COMPLETE_MS,
        JP_VOCAB_POLL_IDLE_COMPLETE_HIDDEN_MS,
        teacherIdleCompleteRef.current
      );

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (cancelled) return;

      if (document.hidden || editingRemarksIdRef.current || editingWordIdRef.current) {
        schedule(pollDelay());
        return;
      }

      const since =
        maxJpVocabUpdatedAt(wordsRef.current) || new Date(0).toISOString();

      if (pollInFlightRef.current) {
        schedule(pollDelay());
        return;
      }

      pollInFlightRef.current = true;
      try {
        const res = await fetch(
          `/api/jp-vocab/sync?since=${encodeURIComponent(since)}&limit=0`,
          { credentials: "include", cache: "no-store" }
        );
        const data = (await res.json()) as {
          ok: boolean;
          words?: JpVocabWord[];
        };
        if (data.ok) {
          if (Array.isArray(data.words) && data.words.length) {
            applySyncPatches(data.words);
          }
        }
      } catch {
        /* 轮询失败静默，下轮再试 */
      } finally {
        pollInFlightRef.current = false;
        if (!cancelled) schedule(pollDelay());
      }
    };

    const onVisibility = () => {
      if (!document.hidden && !cancelled) {
        if (timer) clearTimeout(timer);
        schedule(300);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    schedule(JP_VOCAB_POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [applySyncPatches, checking, user]);

  useEffect(() => {
    if (checking || !user) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      teacherIdleCompleteRef.current
        ? JP_VOCAB_TEACHER_VISIBLE_POLL_IDLE_COMPLETE_MS
        : JP_VOCAB_TEACHER_VISIBLE_POLL_MS;

    const schedule = (delayMs = pollDelay()) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void syncTeacherVisibleLimitFromServer().finally(() => schedule());
      }, delayMs);
    };

    void syncTeacherVisibleLimitFromServer();
    schedule();

    const onVisible = () => {
      if (!document.hidden && !cancelled) {
        if (timer) clearTimeout(timer);
        void syncTeacherVisibleLimitFromServer();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncTeacherVisibleLimitFromServer, checking, user]);

  useEffect(() => {
    return subscribeJpVocabQuizTargetUpdated(() => {
      void syncTeacherVisibleLimitFromServer();
    });
  }, [syncTeacherVisibleLimitFromServer]);

  useEffect(() => {
    if (!canOperate || !JP_VOCAB_SHARE_UI_ENABLED) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      jpVocabPollIntervalMs(
        JP_VOCAB_POLL_MS,
        JP_VOCAB_POLL_HIDDEN_MS,
        JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_MS,
        JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_HIDDEN_MS,
        teacherIdleCompleteRef.current
      );

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (cancelled) return;
      if (shareRequestPollInFlightRef.current) {
        schedule(pollDelay());
        return;
      }
      shareRequestPollInFlightRef.current = true;
      try {
        const res = await fetch("/api/jp-vocab/share-request", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: JpVocabShareRequest[];
        };
        if (data.ok && Array.isArray(data.items)) {
          setShareRequests(data.items);
          if (data.items.length > 0 && !dismissingShareRequestsRef.current) {
            setShowShareRequestModal(true);
          }
        }
      } catch {
        /* 轮询失败静默 */
      } finally {
        shareRequestPollInFlightRef.current = false;
        if (!cancelled) schedule(pollDelay());
      }
    };

    schedule(JP_VOCAB_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canOperate]);

  const dismissShareRequests = useCallback(async () => {
    const ids = shareRequests.map((r) => r.id);
    if (!ids.length) {
      setShowShareRequestModal(false);
      return;
    }
    dismissingShareRequestsRef.current = true;
    setShowShareRequestModal(false);
    setStatus("请在单词表中找到刚才抽查的单词，点击「发给学生」。");
    try {
      const res = await fetch("/api/jp-vocab/share-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ request_ids: ids }),
      });
      if (res.ok) {
        setShareRequests([]);
      }
    } catch {
      /* 忽略 */
    } finally {
      dismissingShareRequestsRef.current = false;
    }
  }, [shareRequests]);

  const displayedWords = useMemo(() => {
    if (statSort.key === "seq" && displayOrder.ids.length > 0) {
      const ordered = jpVocabWordsInOrder(words, displayOrder.ids);
      return statSort.dir === "desc" ? [...ordered].reverse() : ordered;
    }
    if (useDailyRowOrder && displayOrder.ids.length > 0) {
      return jpVocabWordsInOrder(words, displayOrder.ids);
    }
    return sortJpVocabWordsForDisplay(words, statSort);
  }, [words, statSort, displayOrder.ids, useDailyRowOrder]);

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

  const quizSessionRestoredRef = useRef(false);

  const quizWordHasLevel = useCallback(
    (wordId: number) => {
      const w = words.find((item) => item.id === wordId);
      if (!w) return false;
      return (
        effectiveJpVocabDisplayLevel(w, sessionLevel[wordId], { displayOrder }) !=
        null
      );
    },
    [words, sessionLevel, displayOrder]
  );

  const persistQuizSession = useCallback(
    (session: JpVocabTeacherQuizSession | null) => {
      if (!user?.id) return;
      if (!session) {
        clearJpVocabTeacherQuizSession(user.id);
        return;
      }
      writeJpVocabTeacherQuizSession(user.id, quizTarget, session);
    },
    [user?.id, quizTarget]
  );

  useEffect(() => {
    if (!user?.id || quizTarget <= 0 || loading || checking) return;
    if (quizSessionRestoredRef.current) return;
    if (quizTargetWords.length === 0) {
      quizSessionRestoredRef.current = true;
      return;
    }

    quizSessionRestoredRef.current = true;
    const stored = readJpVocabTeacherQuizSession(user.id, quizTarget);
    if (!stored) return;

    const reconciled = reconcileJpVocabTeacherQuizSession(stored, quizTargetWordIds);
    if (!reconciled) {
      clearJpVocabTeacherQuizSession(user.id);
      return;
    }

    const expanded = expandJpVocabTeacherQuizSessionForTarget(
      reconciled,
      quizTargetWords,
      dailySeqByWordId,
      quizWordHasLevel
    );

    // 已抽完：清会话，勿再自动弹出单词卡片；列表展示今日已抽查词条
    if (
      !expanded ||
      isJpVocabTeacherQuizSessionComplete(expanded, quizWordHasLevel) ||
      computeJpVocabDailyQuizProgress(words, {
        quiz_target: quizTarget,
      }).complete
    ) {
      clearJpVocabTeacherQuizSession(user.id);
      setQuizSession(null);
      setShowQuizFlashcard(false);
      return;
    }

    if (canOperate && !isAdmin) {
      const resumeIndex = resolveJpVocabTeacherQuizRefreshResumeIndex(
        expanded,
        new Map(words.map((w) => [w.id, w])),
        sessionReviewAt,
        quizWordHasLevel
      );
      const session = { ...expanded, currentIndex: resumeIndex };
      setQuizSession(session);
      setShowQuizFlashcard(true);
      return;
    }

    setQuizSession(expanded);
  }, [
    user?.id,
    quizTarget,
    loading,
    checking,
    quizTargetWords.length,
    quizTargetWordIds,
    canOperate,
    isAdmin,
    words,
    sessionReviewAt,
    quizWordHasLevel,
  ]);

  useEffect(() => {
    persistQuizSession(quizSession);
  }, [quizSession, persistQuizSession]);

  /** 管理员调高今日抽查数量后：只把新增的未勾选词补进进行中的抽查队列 */
  useEffect(() => {
    if (!quizSession || quizTargetWords.length === 0) return;
    const sessionSet = new Set(quizSession.wordIds);
    const hasNewUnchecked = filterJpVocabTeacherQuizUncheckedWords(
      quizTargetWords,
      quizWordHasLevel
    ).some((w) => !sessionSet.has(w.id));
    if (!hasNewUnchecked) return;
    setQuizSession((prev) => {
      if (!prev) return prev;
      const next = expandJpVocabTeacherQuizSessionForTarget(
        prev,
        quizTargetWords,
        dailySeqByWordId,
        quizWordHasLevel
      );
      if (!next) return null;
      if (
        next.mode === prev.mode &&
        next.currentIndex === prev.currentIndex &&
        next.wordIds.length === prev.wordIds.length &&
        next.wordIds.every((id, i) => id === prev.wordIds[i])
      ) {
        return prev;
      }
      return next;
    });
  }, [
    quizTarget,
    quizTargetWords,
    dailySeqByWordId,
    quizWordHasLevel,
    quizSession,
  ]);

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
    if (isAdmin) return dailyQuizProgress;
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
    isAdmin,
    dailyQuizProgress,
    teacherPendingWords,
    quizWordHasLevel,
    quizTarget,
  ]);

  const searchActive = searchQuery.trim().length > 0;
  /** 老师端隐藏不可操作行（进行中：仅见待抽查；已完成：展示今日已抽查列表） */
  const hideInoperableRows = canOperate && !isAdmin;

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
      canOperate && !isAdmin && dailyQuizProgress.complete;
  }, [canOperate, isAdmin, dailyQuizProgress.complete]);

  const dailyCheckedCount = dailyQuizProgress.checked;

  const anyCheckedInRound = useMemo(
    () => (displayOrder.round_checked_ids ?? []).length > 0,
    [displayOrder.round_checked_ids]
  );

  useEffect(() => {
    if (loading || checking || !canOperate || !words.length || !user) return;
    if (anyCheckedInRound) return;
    if (!shouldShowJpVocabDailyIntro(user.id)) return;
    setShowDailyIntro(true);
  }, [loading, checking, canOperate, words.length, anyCheckedInRound, user?.id]);

  useEffect(() => {
    if (!canOperate || !user || dailyQuizProgress.total <= 0) return;

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
    if (!showDailyComplete || !canOperate || !user) return;

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

  /** 复习合计为 0：历史上从未勾选过熟悉程度 */
  const neverQuizzedCount = useMemo(
    () => words.filter((w) => jpVocabTotalReviews(w) === 0).length,
    [words]
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

  const wordsById = useMemo(
    () => new Map(words.map((w) => [w.id, w])),
    [words]
  );

  const quizCardPreviewSession = useMemo((): JpVocabTeacherQuizSession | null => {
    if (quizCardPreviewWordId == null) return null;
    if (!wordsById.has(quizCardPreviewWordId)) return null;
    return {
      mode: "sequential",
      wordIds: [quizCardPreviewWordId],
      currentIndex: 0,
    };
  }, [quizCardPreviewWordId, wordsById]);

  const closeQuizCardPreview = useCallback(() => {
    setQuizCardPreviewWordId(null);
  }, []);

  const reviewLockedByWordId = useMemo(() => {
    const map: Record<number, boolean> = {};
    for (const w of words) {
      map[w.id] = isWordReviewLocked(w, sessionReviewAt[w.id]);
    }
    return map;
  }, [words, sessionReviewAt, isWordReviewLocked]);

  const quizFlashcardSavingWordId = useMemo(() => {
    for (const [wordId, phase] of Object.entries(wordSyncState)) {
      if (phase === "queued" || phase === "syncing") {
        return Number(wordId);
      }
    }
    return null;
  }, [wordSyncState]);

  const launchTeacherQuizSession = useCallback((session: JpVocabTeacherQuizSession) => {
    setQuizSession(session);
    setShowQuizFlashcard(true);
  }, []);

  const requestTeacherQuizSession = useCallback(
    (mode: JpVocabTeacherQuizMode, startWordId?: number) => {
      const next = createJpVocabTeacherQuizSession(
        mode,
        quizTargetWords,
        dailySeqByWordId,
        startWordId,
        quizWordHasLevel
      );
      if (!next) {
        setStatus(
          quizTarget > 0
            ? "今日抽查池内暂无未抽查词条（已抽过的不会再进入抽查卡片）。"
            : "请管理员先设置今日抽查数量。"
        );
        return;
      }
      if (user && shouldShowJpVocabTeacherQuizIntro(user.id)) {
        setPendingTeacherQuizSession(next);
        setShowTeacherQuizIntro(true);
        return;
      }
      launchTeacherQuizSession(next);
    },
    [
      quizTargetWords,
      dailySeqByWordId,
      quizTarget,
      quizWordHasLevel,
      user,
      launchTeacherQuizSession,
    ]
  );

  const handleTeacherQuizIntroConfirm = useCallback(() => {
    if (!pendingTeacherQuizSession) {
      setShowTeacherQuizIntro(false);
      return;
    }
    launchTeacherQuizSession(pendingTeacherQuizSession);
    setPendingTeacherQuizSession(null);
    setShowTeacherQuizIntro(false);
  }, [pendingTeacherQuizSession, launchTeacherQuizSession]);

  const handleTeacherQuizIntroClose = useCallback(() => {
    setPendingTeacherQuizSession(null);
    setShowTeacherQuizIntro(false);
  }, []);

  const startTeacherQuizWithRandomMode = useCallback(
    (startWordId?: number) => {
      requestTeacherQuizSession(pickRandomJpVocabTeacherQuizMode(), startWordId);
    },
    [requestTeacherQuizSession]
  );

  /** 老师端今日抽查范围内：熟悉程度只能在单词卡片内勾选（管理员可直接在列表改） */
  const teacherQuizLocksTable = canOperate && !isAdmin;

  /** 已有活跃抽查会话（用于「继续抽查」按钮） */
  const teacherQuizInProgress = quizSession != null;

  /**
   * 老师抽查进行中：不展示单词列表，避免在列表里随意点选。
   * 今日/本轮已抽完时必须放开列表（展示已抽查词条），不能再藏表。
   */
  const hideTeacherQuizList =
    canOperate &&
    !isAdmin &&
    teacherQuizInProgress &&
    !dailyQuizProgress.complete &&
    !displayQuizProgress.complete;

  /**
   * 今日/本轮进度已完成后立即关卡片、清会话，回到已抽完列表。
   * 禁止仅因「会话内词都勾了」就关卡：进度仍有剩余时说明可见池里还有未进会话的词，
   * 交给 expand effect / finishTeacherQuiz 补进队列。
   */
  useEffect(() => {
    if (!canOperate || isAdmin || !quizSession) return;
    if (!dailyQuizProgress.complete && !displayQuizProgress.complete) {
      return;
    }
    setShowQuizFlashcard(false);
    setQuizSession(null);
  }, [
    canOperate,
    isAdmin,
    quizSession,
    dailyQuizProgress.complete,
    displayQuizProgress.complete,
  ]);

  /** 会话已清空时同步关掉卡片（避免 expand 返回 null 后 open 仍为 true） */
  useEffect(() => {
    if (quizSession == null) setShowQuizFlashcard(false);
  }, [quizSession]);

  const resumeTeacherQuizFlashcard = useCallback(
    (preferredWordId?: number) => {
      if (!quizSession) return;
      const index =
        preferredWordId != null
          ? resolveJpVocabTeacherQuizResumeIndex(
              quizSession,
              preferredWordId,
              quizWordHasLevel
            )
          : resolveJpVocabTeacherQuizRefreshResumeIndex(
              quizSession,
              wordsById,
              sessionReviewAt,
              quizWordHasLevel
            );
      setQuizSession((prev) => (prev ? { ...prev, currentIndex: index } : prev));
      setShowQuizFlashcard(true);
    },
    [quizSession, quizWordHasLevel, wordsById, sessionReviewAt]
  );

  const finishTeacherQuiz = useCallback(() => {
    if (!quizSession) {
      setShowQuizFlashcard(false);
      return;
    }
    // 进度/可见池仍有未勾选时，先补进会话并跳到该词，禁止只 setStatus 在遮罩后或直接收尾
    const expanded = expandJpVocabTeacherQuizSessionForTarget(
      quizSession,
      quizTargetWords,
      dailySeqByWordId,
      quizWordHasLevel
    );
    if (expanded) {
      const firstUnchecked = findFirstUncheckedJpVocabTeacherQuizIndex(
        expanded,
        quizWordHasLevel,
        0
      );
      if (firstUnchecked >= 0) {
        setQuizSession({ ...expanded, currentIndex: firstUnchecked });
        setShowQuizFlashcard(true);
        return;
      }
    }
    setShowQuizFlashcard(false);
    setQuizSession(null);
    if (!user) return;
    dailyCompleteSnapshotRef.current = {
      complete: dailyQuizProgress.complete,
      total: dailyQuizProgress.total,
    };
    if (shouldShowJpVocabTeacherDailyComplete(user.id, dailyQuizProgress.total)) {
      setShowDailyComplete(true);
    }
  }, [
    quizSession,
    quizTargetWords,
    dailySeqByWordId,
    quizWordHasLevel,
    user,
    dailyQuizProgress.complete,
    dailyQuizProgress.total,
  ]);

  const syncTeacherQuizLiveWord = useCallback(
    async (wordId: number | null) => {
      if (!canOperate) return;
      if (teacherQuizLiveWordRef.current === wordId) return;
      teacherQuizLiveWordRef.current = wordId;
      try {
        await fetch("/api/jp-vocab/teacher-quiz-live", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({ word_id: wordId }),
        });
      } catch {
        teacherQuizLiveWordRef.current = undefined;
      }
    },
    [canOperate, locale]
  );

  const quizFlashcardWordId =
    quizSession?.wordIds[quizSession.currentIndex] ?? null;

  useEffect(() => {
    if (!canOperate) return;
    if (!quizSession) {
      void syncTeacherQuizLiveWord(null);
      return;
    }
    void syncTeacherQuizLiveWord(quizFlashcardWordId);
  }, [canOperate, quizSession, quizFlashcardWordId, syncTeacherQuizLiveWord]);

  useEffect(() => {
    if (!canOperate || !showQuizFlashcard || !quizFlashcardWordId) {
      setStudentPeekedCurrentWord(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      document.hidden ? JP_VOCAB_POLL_HIDDEN_MS : JP_VOCAB_QUIZ_LIVE_POLL_MS;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/jp-vocab/teacher-quiz-live?word_id=${encodeURIComponent(
            String(quizFlashcardWordId)
          )}`,
          { credentials: "include", cache: "no-store" }
        );
        const data = (await res.json()) as {
          ok: boolean;
          student_peeked?: boolean;
        };
        if (!cancelled && data.ok) {
          setStudentPeekedCurrentWord(Boolean(data.student_peeked));
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) schedule(pollDelay());
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canOperate, showQuizFlashcard, quizFlashcardWordId]);

  const todayCheckStats = useMemo(
    () => jpVocabTodayCheckStats(words),
    [words]
  );

  const recordLevel = async (
    wordId: number,
    level: JpVocabLevel,
    source: "flashcard" | "table" = "table"
  ) => {
    if (!canOperate) {
      setStatus("请登录后再勾选熟悉程度。");
      openJpAuth();
      return;
    }
    if (!isWordInQuizTarget(wordId) && !isAdmin) {
      setStatus(`仅今日抽查池内的词条可勾选熟悉程度（共 ${quizTarget} 个）。`);
      return;
    }
    if (source !== "flashcard" && !isAdmin) {
      if (quizSession != null) {
        resumeTeacherQuizFlashcard(wordId);
      } else {
        startTeacherQuizWithRandomMode(wordId);
      }
      setStatus("今日抽查范围内的熟悉程度请在单词卡片内勾选。");
      return;
    }
    const snapshotForLock = words.find((w) => w.id === wordId);
    if (
      snapshotForLock &&
      isWordReviewLocked(snapshotForLock, sessionReviewAt[wordId])
    ) {
      setStatus("勾选已满 1 小时，无法再修改熟悉程度。");
      return;
    }
    if (wordSyncState[wordId]) {
      setStatus("正在提交，请勿重复提交");
      return;
    }

    const snapshot = words.find((w) => w.id === wordId);
    if (!snapshot) return;
    const prevReviewAt = sessionReviewAt[wordId];
    const nowMs = Date.now();
    const prevLevel =
      resolveJpVocabPreviousLevel(snapshot, {
        sessionLevel: sessionLevel[wordId],
        sessionReviewAtMs: prevReviewAt,
        nowMs,
      }) ?? undefined;
    const displayOrderSnapshot = displayOrderRef.current;
    const sharedIdsSnapshot = [...sharedTodayWordIdsRef.current];
    const wasAlreadyShared = sharedTodayWordIds.has(wordId);
    const skipShareUi = wasAlreadyShared || studentPeekedCurrentWord;

    setSessionLevel((prev) => ({ ...prev, [wordId]: level }));
    setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
    setDisplayOrder((prev) => markJpVocabRoundChecked(prev, wordId));
    setHighlightId(wordId);
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId ? bumpJpVocabWordReview(w, level, prevLevel) : w
      )
    );
    if (!wasAlreadyShared) {
      const nextSharedIds = [...sharedIdsSnapshot, wordId];
      setSharedTodayWordIds(new Set(nextSharedIds));
      persistJpVocabPageCache(
        wordsRef.current.map((w) =>
          w.id === wordId ? bumpJpVocabWordReview(w, level, prevLevel) : w
        ),
        refsRef.current,
        markJpVocabRoundChecked(displayOrderSnapshot, wordId),
        nextSharedIds
      );
    }

    setWordSyncPhase(wordId, "queued");
    patchShareProgress(wordId, JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
    if (saveQueuePending > 0) {
      setStatus(`已更新界面，排队同步中（${saveQueuePending + 1} 项）…`);
    } else if (!skipShareUi) {
      setStatus("已更新界面，正在同步到学生端…");
    } else {
      setStatus("已更新界面，正在保存熟悉程度…");
    }

    try {
      await jpVocabSaveQueue.enqueue(async () => {
        setWordSyncPhase(wordId, "syncing");
        const startedAt = Date.now();
        patchShareProgress(wordId, 0);
        clearShareTimer(wordId);
        shareProgressTimersRef.current.set(
          wordId,
          setInterval(() => {
            patchShareProgress(
              wordId,
              jpVocabShareProgressPercent(Date.now() - startedAt)
            );
          }, 200)
        );

        try {
          const res = await fetch("/api/jp-vocab", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [LOCALE_HEADER]: locale,
            },
            credentials: "include",
            body: JSON.stringify({ word_id: wordId, level }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            word?: JpVocabWord;
            shared?: boolean;
            shared_new?: boolean;
            error?: string;
          };
          if (res.status === 401) {
            await refresh();
            throw new Error(JP_VOCAB_SAVE_ERR[locale]);
          }
          if (!data.ok || !data.word) {
            const msg =
              data.error || (locale === "zh" ? "保存失败" : "Save failed");
            throw new Error(msg);
          }

          clearShareTimer(wordId);
          await animateJpVocabShareProgressTo100(
            wordId,
            startedAt,
            (id, percent) => patchShareProgress(id, percent)
          );
          patchShareProgress(wordId, null);

          const nextSharedIds =
            data.shared && !sharedTodayWordIdsRef.current.has(wordId)
              ? [...sharedTodayWordIdsRef.current, wordId]
              : [...sharedTodayWordIdsRef.current];

          setWords((prev) => {
            const next = prev.map((w) => (w.id === data.word!.id ? data.word! : w));
            persistJpVocabPageCache(
              next,
              refsRef.current,
              displayOrderRef.current,
              nextSharedIds
            );
            return next;
          });
          if (data.shared) {
            setSharedTodayWordIds(new Set(nextSharedIds));
          }
          setStatus(
            data.shared_new
              ? "已勾选熟悉程度，并同步到学生「今日日语单词」。"
              : studentPeekedCurrentWord
                ? "熟悉程度已保存。"
                : wasAlreadyShared || data.shared
                  ? "熟悉程度已更新，学生端已同步。"
                  : "熟悉程度已保存。"
          );
          if (data.shared_new) {
            notifyJpVocabSharedUpdated({ wordId, openRemarks: true });
          }
        } finally {
          clearShareTimer(wordId);
          patchShareProgress(wordId, null);
          setWordSyncPhase(wordId, null);
        }
      });
    } catch (err) {
      clearShareTimer(wordId);
      patchShareProgress(wordId, null);
      setWordSyncPhase(wordId, null);
      if (snapshot) {
        setWords((prev) =>
          prev.map((w) => (w.id === wordId ? snapshot : w))
        );
      }
      setDisplayOrder(displayOrderSnapshot);
      setSessionLevel((prev) => {
        const next = { ...prev };
        if (prevLevel) next[wordId] = prevLevel;
        else delete next[wordId];
        return next;
      });
      setSessionReviewAt((prev) => {
        const next = { ...prev };
        if (prevReviewAt != null) next[wordId] = prevReviewAt;
        else delete next[wordId];
        return next;
      });
      if (!wasAlreadyShared) {
        setSharedTodayWordIds(new Set(sharedIdsSnapshot));
        persistJpVocabPageCache(
          wordsRef.current,
          refsRef.current,
          displayOrderSnapshot,
          sharedIdsSnapshot
        );
      }
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const tryRecordLevel = (wordId: number, level: JpVocabLevel) => {
    void recordLevel(wordId, level, "table");
  };

  const shareWord = async (wordId: number) => {
    if (!canShareToStudy) {
      setStatus("仅管理员或日语老师可共享。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再共享。");
      openJpAuth();
      return;
    }
    if (!isWordInQuizTarget(wordId)) {
      setStatus(`仅今日抽查池内的词条可发给学生（共 ${quizTarget} 个）。`);
      return;
    }
    const snapshot = words.find((w) => w.id === wordId);
    if (!snapshot) return;
    if (isWordReviewLocked(snapshot, sessionReviewAt[wordId])) {
      setStatus("勾选已满 1 小时，无法再发给学生。");
      return;
    }
    if (wordSyncState[wordId]) {
      setStatus("正在提交，请勿重复提交");
      return;
    }
    if (sharedTodayWordIds.has(wordId)) {
      setStatus("该词今日已共享。");
      return;
    }

    setWordSyncPhase(wordId, "queued");
    patchShareProgress(wordId, JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);

    try {
      const result = await jpVocabSaveQueue.enqueue(async () => {
        setWordSyncPhase(wordId, "syncing");
        const startedAt = Date.now();
        patchShareProgress(wordId, 0);
        clearShareTimer(wordId);
        shareProgressTimersRef.current.set(
          wordId,
          setInterval(() => {
            patchShareProgress(
              wordId,
              jpVocabShareProgressPercent(Date.now() - startedAt)
            );
          }, 200)
        );
        setStatus("正在发给学生，传输中…");

        try {
          const res = await fetch("/api/jp-vocab/share", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [LOCALE_HEADER]: locale,
            },
            credentials: "include",
            body: JSON.stringify({ word_id: wordId }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            word?: JpVocabWord;
            error?: string;
          };
          if (res.status === 401) {
            await refresh();
            throw new Error(JP_VOCAB_SAVE_ERR[locale]);
          }
          if (res.status === 409 || data.error === "already_shared_today") {
            return { kind: "already" as const, startedAt };
          }
          if (!data.ok || !data.word) {
            throw new Error(data.error || (locale === "zh" ? "共享失败" : "Share failed"));
          }
          return { kind: "ok" as const, word: data.word, startedAt };
        } finally {
          clearShareTimer(wordId);
        }
      });

      const startedAt =
        result.kind === "already" || result.kind === "ok"
          ? result.startedAt
          : Date.now();
      await animateJpVocabShareProgressTo100(
        wordId,
        startedAt,
        (id, percent) => patchShareProgress(id, percent)
      );
      patchShareProgress(wordId, null);
      setWordSyncPhase(wordId, null);

      if (result.kind === "already") {
        setSharedTodayWordIds((prev) => new Set([...prev, wordId]));
        setStatus("该词今日已共享。");
        return;
      }

      const prevReviewAt = sessionReviewAt[wordId];
      const nowMs = Date.now();
      const prevLevel =
        resolveJpVocabPreviousLevel(snapshot, {
          sessionLevel: sessionLevel[wordId],
          sessionReviewAtMs: prevReviewAt,
          nowMs,
        }) ?? undefined;
      const alreadyMarked =
        prevLevel != null ||
        effectiveTodayCheckCount(
          snapshot.today_check_count ?? 0,
          snapshot.today_check_date
        ) > 0;
      const updatedWord = result.word;
      let nextDisplayOrder = displayOrderRef.current;

      if (!alreadyMarked) {
        nextDisplayOrder = markJpVocabRoundChecked(nextDisplayOrder, wordId);
        setDisplayOrder(nextDisplayOrder);
        setSessionLevel((prev) => ({ ...prev, [wordId]: "weak" }));
        setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
      }

      const nextSharedIds = [...sharedTodayWordIdsRef.current, wordId];
      setWords((prev) => {
        const next = prev.map((w) => (w.id === wordId ? updatedWord : w));
        persistJpVocabPageCache(next, refsRef.current, nextDisplayOrder, nextSharedIds);
        return next;
      });
      setSharedTodayWordIds(new Set(nextSharedIds));
      setHighlightId(wordId);
      setStatus(
        alreadyMarked
          ? "已共享到学生「今日日语单词」。"
          : "已共享到学生「今日日语单词」，并标记为不熟悉。"
      );
      notifyJpVocabSharedUpdated({ wordId, openRemarks: true });
    } catch (err) {
      clearShareTimer(wordId);
      patchShareProgress(wordId, null);
      setWordSyncPhase(wordId, null);
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const unshareWord = async (wordId: number) => {
    if (!canShareToStudy) {
      setStatus("仅管理员或日语老师可取消共享。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再取消共享。");
      openJpAuth();
      return;
    }
    if (wordSyncState[wordId]) {
      setStatus("正在提交，请勿重复提交");
      return;
    }
    if (!sharedTodayWordIds.has(wordId)) {
      setStatus("该词今日尚未共享。");
      return;
    }

    const sharedIdsSnapshot = [...sharedTodayWordIdsRef.current];
    const nextSharedIds = sharedIdsSnapshot.filter((id) => id !== wordId);
    setSharedTodayWordIds(new Set(nextSharedIds));
    persistJpVocabPageCache(
      wordsRef.current,
      refsRef.current,
      displayOrderRef.current,
      nextSharedIds
    );

    setHighlightId(wordId);
    setStatus("已取消共享，学生「今日日语单词」中不再显示该词。");
    notifyJpVocabSharedUpdated({ wordId });

    try {
      await jpVocabSaveQueue.enqueue(async () => {
        const res = await fetch("/api/jp-vocab/share", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({ word_id: wordId }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          word?: JpVocabWord;
          reverted?: boolean;
          display_order?: JpVocabDailyDisplayOrder | null;
          error?: string;
        };
        if (res.status === 401) {
          await refresh();
          throw new Error(JP_VOCAB_SAVE_ERR[locale]);
        }
        if (res.status === 409 || data.error === "not_shared_today") {
          return;
        }
        if (!data.ok || !data.word) {
          throw new Error(data.error || (locale === "zh" ? "取消共享失败" : "Unshare failed"));
        }

        setWords((prev) => {
          const next = prev.map((w) => (w.id === data.word!.id ? data.word! : w));
          persistJpVocabPageCache(
            next,
            refsRef.current,
            data.display_order ?? displayOrderRef.current,
            [...sharedTodayWordIdsRef.current]
          );
          return next;
        });

        if (data.reverted) {
          setSessionLevel((prev) => {
            const next = { ...prev };
            delete next[wordId];
            return next;
          });
          setSessionReviewAt((prev) => {
            const next = { ...prev };
            delete next[wordId];
            return next;
          });
          if (data.display_order) {
            setDisplayOrder(data.display_order);
          } else {
            setDisplayOrder((prev) => unmarkJpVocabRoundChecked(prev, wordId));
          }
          setStatus("已取消共享，并撤销自动标记的不熟悉。");
        }
      });
    } catch (err) {
      setSharedTodayWordIds(new Set(sharedIdsSnapshot));
      persistJpVocabPageCache(
        wordsRef.current,
        refsRef.current,
        displayOrderRef.current,
        sharedIdsSnapshot
      );
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteWord = async (word: JpVocabWord) => {
    if (!isAdmin) {
      setStatus("仅 Admin 账户可删除词条。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再删除。");
      openJpAuth();
      return;
    }
    if (deletingId === word.id || wordSyncState[word.id]) return;

    const ok = window.confirm(`确定删除「${word.word}」？此操作不可恢复。`);
    if (!ok) return;

    setDeletingId(word.id);
    setStatus("");
    setError("");

    try {
      await jpVocabSaveQueue.enqueue(async () => {
        const res = await fetch("/api/jp-vocab/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({ word_ids: [word.id] }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          deleted?: number;
          words?: JpVocabWord[];
          display_order?: JpVocabDailyDisplayOrder;
          error?: string;
        };
        if (res.status === 403) {
          throw new Error("仅 Admin 账户可删除词条。");
        }
        if (!data.ok || !data.words || !data.display_order) {
          throw new Error(data.error || "删除失败");
        }

        const wasShared = sharedTodayWordIds.has(word.id);
        const nextSharedIds = [...sharedTodayWordIdsRef.current].filter(
          (id) => id !== word.id
        );
        setWords(data.words);
        setDisplayOrder(data.display_order);
        persistJpVocabPageCache(
          data.words,
          refsRef.current,
          data.display_order,
          nextSharedIds
        );
        setSharedTodayWordIds(new Set(nextSharedIds));
        setSessionLevel((prev) => {
          const next = { ...prev };
          delete next[word.id];
          return next;
        });
        setSessionReviewAt((prev) => {
          const next = { ...prev };
          delete next[word.id];
          return next;
        });
        if (highlightId === word.id) {
          setHighlightId(null);
        }
        if (wasShared) {
          notifyJpVocabSharedUpdated({ wordId: word.id });
        }
        setStatus(`已删除词条「${word.word}」。`);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  const runReset = async (action: "reset_today" | "reset") => {
    setResetting(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/jp-vocab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        words?: JpVocabWord[];
        display_order?: JpVocabDailyDisplayOrder;
        teacher_visible_limit?: JpVocabTeacherVisibleLimit;
        error?: string;
      };
      if (!data.ok || !data.words || !data.display_order) {
        throw new Error(data.error || "重置失败");
      }
      setWords(data.words);
      setDisplayOrder(data.display_order);
      if (data.teacher_visible_limit) {
        setTeacherVisibleLimit(data.teacher_visible_limit);
        persistJpVocabPageCache(
          data.words,
          refs,
          data.display_order,
          undefined,
          data.teacher_visible_limit
        );
      } else {
        persistJpVocabPageCache(data.words, refs, data.display_order);
      }
      setSessionLevel({});
      setSessionReviewAt({});
      setUseDailyRowOrder(true);
      setStatSort(JP_VOCAB_DEFAULT_STAT_SORT);
      setHighlightId(null);
      setPage(1);
      setShowResetChoice(false);
      setStatus(
        action === "reset_today"
          ? "已今日重置：单词顺序已更新，当前轮次勾选已清空；今日抽查数量与统计次数保持不变。"
          : "已全部重置，可以开始新一轮复习。"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  };

  const openResetChoice = () => {
    if (!canOperate) {
      setStatus("请登录后再重置。");
      openJpAuth();
      return;
    }
    if (resetting) return;
    setShowResetChoice(true);
  };

  const resetToday = () => void runReset("reset_today");

  const resetAll = () => {
    const ok = window.confirm(
      "确定全部重置？将清空所有单词的熟悉程度勾选与统计次数，开始新一轮复习。"
    );
    if (!ok) return;
    void runReset("reset");
  };

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
    persistJpVocabPageCache(nextWords, nextRefs, nextDisplayOrder);
    setStatus(
      `已添加：${added.word}${refDeduped ? "（共用教案链接）" : ""}`
    );
  };

  const handleWordSaved = useCallback(
    (word: JpVocabWord) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === word.id ? word : w));
        persistJpVocabPageCache(next, refs, displayOrderRef.current);
        return next;
      });
      setEditingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
      setViewingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
      if (editingRemarksIdRef.current !== word.id) {
        setStatus("词条已保存。");
      }
    },
    [refs]
  );

  const handleWordSaveFailed = useCallback(
    (wordId: number, snapshot: JpVocabWord, message: string) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === wordId ? snapshot : w));
        persistJpVocabPageCache(next, refs, displayOrderRef.current);
        return next;
      });
      setStatus(message);
    },
    [refs]
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

  const goToCoachPage = async () => {
    if (coachNavBusy) return;
    setCoachNavBusy(true);
    setError("");
    try {
      // 完成弹窗弹出时已批量写入；这里只跳转，避免再打一轮 D1
      if (user) {
        markJpVocabTeacherDailyCompleteDismissed(user.id, dailyQuizProgress.total);
      }
      setShowDailyComplete(false);
      router.push(jpVocabCoachPath());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCoachNavBusy(false);
    }
  };

  const setDailyQuizTarget = async () => {
    if (!isAdmin || settingQuizTarget) return;
    const trimmed = quizTargetInput.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed)) {
      setStatus("请输入今日抽查数量。");
      return;
    }
    const count = Math.min(999, Math.max(1, Math.floor(parsed)));
    setSettingQuizTarget(true);
    setStatus("");
    try {
      const res = await fetch("/api/jp-vocab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "set_daily_quiz_target",
          count,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        teacher_visible_limit?: JpVocabTeacherVisibleLimit;
        error?: string;
      };
      if (!data.ok || !data.teacher_visible_limit) {
        throw new Error(data.error || "操作失败");
      }
      setTeacherVisibleLimit(data.teacher_visible_limit);
      setQuizTargetInput(String(data.teacher_visible_limit.quiz_target));
      const prev = readJpVocabPageCache();
      if (prev) {
        writeClientCache(JP_VOCAB_CACHE_KEY, {
          ...prev,
          teacher_visible_limit: data.teacher_visible_limit,
        });
      }
      notifyJpVocabQuizTargetUpdated({
        quiz_target: data.teacher_visible_limit.quiz_target,
        quiz_target_adjusted_at: data.teacher_visible_limit.quiz_target_adjusted_at,
      });
      setStatus(
        `今日抽查数量已设为 ${data.teacher_visible_limit.quiz_target} 个（老师端按可见池抽查，优先从未抽查过的词条）。` +
          ` japanese 域名下已打开的老师页约 3 秒内自动同步；若未打开请刷新 japanese.info-quests.com/jp-vocab。`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSettingQuizTarget(false);
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
        subtitle="请登录后继续访问日语单词 / 语法抽问。"
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

  return (
    <main className="page-wrap jp-vocab-page" style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>日语单词 / 语法抽问</h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        {JP_VOCAB_SHARE_UI_ENABLED ? (
          <>
            抽查 → 提问后勾选熟悉程度 → 答不出或不熟悉时点「发给学生」（同时
            <strong>系统自动标记为不熟悉</strong>），供学生复习。
          </>
        ) : (
          <>
            抽查 → 提问后勾选熟悉程度，自动同步到学生「今日日语单词」（学生端仅可查看，不可改选）。
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

      {canOperate && (displayQuizProgress.total > 0 || displayQuizProgress.complete || isAdmin) ? (
        <JpVocabDailyQuizProgressBar
          progress={displayQuizProgress}
          variant="teacher"
          adminQuizTarget={
            isAdmin
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
            dailyQuizProgress.complete
              ? {
                  busy: coachNavBusy,
                  coachCount:
                    dailyCoachLevelCounts.normal + dailyCoachLevelCounts.weak,
                  onClick: () => void goToCoachPage(),
                }
              : undefined
          }
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
                  {" "}
                  · 今日抽查{" "}
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
              {canOperate ? <> · 本轮未勾选 {unmarkedCount}</> : null}
              {refreshing ? <> · 加载中…</> : null}
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
            {isAdmin ? (
              <button
                type="button"
                className="btn-rsi-filter"
                onClick={() => setShowExportChoice(true)}
                disabled={loading || exporting || !words.length}
                title="导出单词表为 Word 文档"
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
            {isAdmin ? (
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
                ：根据「复习次数统计」估算每个单词/语法下节课该先抽查谁，数值越高越建议优先提问。
                计算公式：一般 × 1 + 不熟悉 × 2 − 非常熟悉 × 0.3（保留 1 位小数）。
                ≥ 3 建议重点抽查，≥ 1 建议留意，&lt; 1 掌握较好；
                为 0 或更低表示尚未复习，或多次勾选「非常熟悉」。
                「今日抽查次数」：每勾选一次熟悉程度 +1，北京时间 0 点自动归零；同一单词今日内改选（如非常熟悉改一般）视为修正，不重复计次，只按最后一次勾选更新统计。
                单词表默认按抽查优先级排序，每天北京时间 0 点重排一次；当天内勾选或刷新页面不会改变顺序（所有老师看到相同顺序）。管理员在「今日抽查数量」中设置目标后，系统会自动为老师生成可见词条池：优先从未抽查过的词条，不足时按当日序号升序补足（跳过今日已抽查）；可勾选「隐藏老师端已抽查单词」控制老师是否仍能看到今日已抽查词条。跨日自动回到默认设置。管理员可使用「重置 → 今日重置」立即重排并清空当前轮次勾选，统计次数不变。
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
                title={`按${jpVocabPriorityLabel(locale)}排序（一般×1 + 不熟悉×2 − 非常熟悉×0.3）；再次点击切换升降序`}
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
            isAdmin={isAdmin}
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
            onPreviewQuizCard={
              isAdmin
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
        onClose={() => setShowRiskChart(false)}
      />
      ) : null}

      {user ? (
        <JpVocabDailyQuizIntroModal
          userId={user.id}
          open={showDailyIntro}
          onClose={() => setShowDailyIntro(false)}
        />
      ) : null}

      {user ? (
        <JpVocabDailyQuizCompleteModal
          open={showDailyComplete}
          total={dailyQuizProgress.total}
          variant="teacher"
          levelCounts={dailyCoachLevelCounts}
          coachBusy={coachNavBusy}
          onGoToCoach={() => void goToCoachPage()}
          onClose={() => {
            markJpVocabTeacherDailyCompleteDismissed(
              user.id,
              dailyQuizProgress.total
            );
            setShowDailyComplete(false);
          }}
        />
      ) : null}

      {JP_VOCAB_SHARE_UI_ENABLED ? (
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
        canOperate={canOperate}
        shareUiEnabled={JP_VOCAB_SHARE_UI_ENABLED && canShareToStudy}
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

      {isAdmin ? (
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
