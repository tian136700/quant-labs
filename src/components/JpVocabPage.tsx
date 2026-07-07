"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  jpVocabPriorityLabel,
  jpVocabRiskIndex,
  formatJpVocabTotalReviewsDisplay,
  jpVocabTotalReviewsZeroHint,
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
import { JpVocabEditModal } from "@/components/JpVocabEditModal";
import { JpClassNotesEditModal } from "@/components/JpClassNotesEditModal";
import { JpEditIconButton } from "@/components/JpEditIconButton";
import { JpVocabRemarksViewModal } from "@/components/JpVocabRemarksViewModal";
import { JpVocabManualAddModal } from "@/components/JpVocabManualAddModal";
import { JpVocabRiskChartModal } from "@/components/JpVocabRiskChartModal";
import {
  JpVocabDailyQuizIntroModal,
  shouldShowJpVocabDailyIntro,
} from "@/components/JpVocabDailyQuizIntroModal";
import { JpVocabDailyQuizProgressBar } from "@/components/JpVocabDailyQuizProgressBar";
import { JpVocabDailyQuizCompleteModal } from "@/components/JpVocabDailyQuizCompleteModal";
import { JpVocabResetChoiceModal } from "@/components/JpVocabResetChoiceModal";
import {
  JP_VOCAB_CACHE_KEY,
  JP_VOCAB_REFRESH_TTL_MS,
  parseJpVocabApi,
  type JpVocabApiPayload,
} from "@/lib/jp-api-cache";
import {
  fetchWithClientCache,
  readClientCache,
  readClientCacheAge,
  writeClientCache,
} from "@/lib/client-swr-cache";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import {
  JP_VOCAB_POLL_MS,
  JP_VOCAB_POLL_HIDDEN_MS,
  maxJpVocabUpdatedAt,
  mergeJpVocabSyncPatches,
} from "@/lib/jp-vocab-sync";
import { JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT } from "@/lib/jp-vocab-daily-quiz-style";
import { exportJpVocabToExcel } from "@/lib/jp-vocab-export";
import {
  effectiveTodayCheckCount,
  jpVocabTodayCheckStats,
  beijingDateString,
} from "@/lib/jp-vocab-daily-check";
import {
  applyJpVocabReview,
  effectiveJpVocabDisplayLevel,
  resolveJpVocabPreviousLevel,
} from "@/lib/jp-vocab-review";
import {
  filterJpVocabWordsByTeacherVisibleLimit,
  jpVocabTeacherVisibleRangeLabel,
  JP_VOCAB_TEACHER_VISIBLE_STEP,
  normalizeJpVocabTeacherVisibleLimit,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import { JpVocabRefPreviewModal } from "@/components/JpVocabRefPreviewModal";
import { resolveJpVocabRefForPreview } from "@/lib/jp-vocab-ref-shared";
import {
  computeJpVocabDailyQuizProgress,
  JP_VOCAB_DAILY_QUIZ_TOP,
} from "@/lib/jp-vocab-daily-quiz-progress";
import {
  markJpVocabTeacherDailyCompleteDismissed,
  shouldShowJpVocabTeacherDailyComplete,
} from "@/lib/jp-vocab-daily-complete-dismiss";
import { notifyJpVocabSharedUpdated } from "@/lib/jp-vocab-shared-notify";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

function readVocabCache(): JpVocabApiPayload | null {
  return readClientCache<JpVocabApiPayload>(JP_VOCAB_CACHE_KEY);
}

function persistVocabCache(
  words: JpVocabWord[],
  refs: Record<string, JpVocabRef>,
  display_order: JpVocabDailyDisplayOrder,
  shared_today_word_ids?: number[],
  teacher_visible_limit?: JpVocabTeacherVisibleLimit
) {
  const prev = readVocabCache();
  writeClientCache(JP_VOCAB_CACHE_KEY, {
    words,
    refs,
    daily_quiz_style: prev?.daily_quiz_style ?? JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
    display_order,
    shared_today_word_ids:
      shared_today_word_ids ??
      prev?.shared_today_word_ids ??
      [],
    teacher_visible_limit:
      teacher_visible_limit ??
      prev?.teacher_visible_limit ??
      normalizeJpVocabTeacherVisibleLimit(null),
  });
}

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

const STAT_SORT_COLUMNS: {
  key: JpVocabStatSortKey;
  label: string;
  labelLines?: [string, string];
  className: string;
}[] = [
  { key: "very", label: "非常熟悉", labelLines: ["非常", "熟悉"], className: "jp-vocab-stat-detail" },
  { key: "normal", label: "一般", className: "jp-vocab-stat-detail" },
  { key: "weak", label: "不熟悉", labelLines: ["不", "熟悉"], className: "jp-vocab-stat-detail" },
  { key: "total", label: "合计", className: "jp-vocab-stat-total" },
];

/** 单词表「备注」列 */
const SHOW_REMARKS_COLUMN = true;

/** 暂时隐藏「随机高亮」按钮 */
const SHOW_RANDOM_HIGHLIGHT = false;

/** 单词表每页条数 */
const JP_VOCAB_PAGE_SIZE = 100;

function jpVocabCheckedInRound(
  order: JpVocabDailyDisplayOrder,
  word: JpVocabWord
): boolean {
  if (order.date !== beijingDateString()) return false;
  return isJpVocabRoundChecked(order, word.id);
}

function jpVocabWordsInOrder(
  words: JpVocabWord[],
  order: number[]
): JpVocabWord[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  const seen = new Set<number>();
  const ordered: JpVocabWord[] = [];
  for (const id of order) {
    const word = byId.get(id);
    if (word) {
      ordered.push(word);
      seen.add(id);
    }
  }
  for (const word of words) {
    if (!seen.has(word.id)) ordered.push(word);
  }
  return ordered;
}

function pickRandomWord(words: JpVocabWord[], excludeId?: number): JpVocabWord | null {
  if (!words.length) return null;
  const pool =
    excludeId != null && words.length > 1
      ? words.filter((w) => w.id !== excludeId)
      : words;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function bumpWordReview(
  word: JpVocabWord,
  level: JpVocabLevel,
  previousLevel?: JpVocabLevel
): JpVocabWord {
  return applyJpVocabReview(word, level, new Date(), previousLevel).word;
}

const SAVE_ERR = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

export function JpVocabPage() {
  const { locale } = useI18n();
  const { user, checking, canAccessJpVocab, canAccessJpVocabStudy, refresh, openAuthPanel, isAdmin } =
    useEtrAuth();
  const canOperate = canAccessJpVocab;
  const canShareToStudy = canAccessJpVocabStudy;

  const openJpAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 日语单词",
      subtitle: "登录用户方可修改数据。",
    });
  }, [openAuthPanel]);
  const [words, setWords] = useState<JpVocabWord[]>([]);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetChoice, setShowResetChoice] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [sharedTodayWordIds, setSharedTodayWordIds] = useState<Set<number>>(
    () => new Set(readVocabCache()?.shared_today_word_ids ?? [])
  );
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
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
  const [previewRef, setPreviewRef] = useState<{
    ref: JpVocabRef;
    cacheVersion?: string | null;
  } | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<JpVocabWord | null>(null);
  const [statSort, setStatSort] = useState<{
    key: JpVocabStatSortKey;
    dir: "asc" | "desc";
  }>(() => JP_VOCAB_DEFAULT_STAT_SORT);
  /** 未手动点列头排序时，行顺序用当日固定 display_order；点过后按列头数值排序 */
  const [useDailyRowOrder, setUseDailyRowOrder] = useState(true);
  /** 服务端持久化的当日行顺序（北京时间 0 点重排，当天内刷新/勾选不变） */
  const [displayOrder, setDisplayOrder] = useState<JpVocabDailyDisplayOrder>({
    date: "",
    ids: [],
    round_checked_ids: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<JpVocabKindFilter>("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [showRiskChart, setShowRiskChart] = useState(false);
  const [showDailyIntro, setShowDailyIntro] = useState(false);
  const [showDailyComplete, setShowDailyComplete] = useState(false);
  const dailyQuizCompleteWasRef = useRef<boolean | null>(null);
  const [showVocabHelp, setShowVocabHelp] = useState(false);
  const [teacherVisibleLimit, setTeacherVisibleLimit] = useState<JpVocabTeacherVisibleLimit>(
    () =>
      readVocabCache()?.teacher_visible_limit ??
      normalizeJpVocabTeacherVisibleLimit(null)
  );
  const [expandingTeacherVisible, setExpandingTeacherVisible] = useState(false);
  const displayOrderRef = useRef(displayOrder);
  const wordsRef = useRef(words);
  const refsRef = useRef(refs);
  const editingRemarksIdRef = useRef<number | null>(null);
  const editingWordIdRef = useRef<number | null>(null);
  const sharedTodayWordIdsRef = useRef(sharedTodayWordIds);
  const pollInFlightRef = useRef(false);
  const scrollToHighlightRef = useRef(false);

  useEffect(() => {
    displayOrderRef.current = displayOrder;
  }, [displayOrder]);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);
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

  const applyVocabPayload = useCallback((payload: JpVocabApiPayload) => {
    setWords(payload.words);
    setRefs(payload.refs);
    setDisplayOrder(payload.display_order);
    setSharedTodayWordIds(new Set(payload.shared_today_word_ids ?? []));
    setTeacherVisibleLimit(payload.teacher_visible_limit);
  }, []);

  const loadWords = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readVocabCache();
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
  }, [applyVocabPayload]);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  /** 北京时间跨日后清空前端勾选回显，并拉取当日新顺序 */
  useEffect(() => {
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
  }, [loadWords]);

  const applySyncPatches = useCallback((patches: JpVocabWord[]) => {
    if (!patches.length) return;
    setWords((prev) => {
      const next = mergeJpVocabSyncPatches(prev, patches);
      persistVocabCache(next, refsRef.current, displayOrderRef.current);
      return next;
    });
    setViewingRemarksWord((prev) => {
      if (!prev) return prev;
      const patch = patches.find((w) => w.id === prev.id);
      if (!patch || patch.updated_at <= prev.updated_at) return prev;
      return { ...prev, ...patch };
    });
  }, []);

  const applyTeacherVisibleSync = useCallback(
    (raw: Partial<JpVocabTeacherVisibleLimit> | undefined) => {
      if (!raw) return;
      const next = normalizeJpVocabTeacherVisibleLimit(raw);
      setTeacherVisibleLimit((prev) => {
        if (prev.date === next.date && prev.limit === next.limit) return prev;
        const cached = readVocabCache();
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

  useEffect(() => {
    if (loading || !words.length) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      document.hidden ? JP_VOCAB_POLL_HIDDEN_MS : JP_VOCAB_POLL_MS;

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

      const since = maxJpVocabUpdatedAt(wordsRef.current);
      if (!since) {
        schedule(pollDelay());
        return;
      }

      if (pollInFlightRef.current) {
        schedule(pollDelay());
        return;
      }

      pollInFlightRef.current = true;
      try {
        const res = await fetch(
          `/api/jp-vocab/sync?since=${encodeURIComponent(since)}`,
          { credentials: "include" }
        );
        const data = (await res.json()) as {
          ok: boolean;
          words?: JpVocabWord[];
          teacher_visible_limit?: Partial<JpVocabTeacherVisibleLimit>;
        };
        if (data.ok) {
          if (Array.isArray(data.words) && data.words.length) {
            applySyncPatches(data.words);
          }
          if (!isAdmin) {
            applyTeacherVisibleSync(data.teacher_visible_limit);
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
  }, [loading, words.length, applySyncPatches, applyTeacherVisibleSync, isAdmin]);

  const displayedWords = useMemo(() => {
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

  const teacherVisibleWords = useMemo(() => {
    if (isAdmin) return displayedWords;
    return filterJpVocabWordsByTeacherVisibleLimit(
      displayedWords,
      displayOrder,
      teacherVisibleLimit.limit
    );
  }, [displayedWords, displayOrder, isAdmin, teacherVisibleLimit.limit]);

  const filteredDisplayedWords = useMemo(
    () => filterJpVocabWordsBySearch(teacherVisibleWords, searchQuery, kindFilter),
    [teacherVisibleWords, searchQuery, kindFilter]
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredDisplayedWords.length / JP_VOCAB_PAGE_SIZE)
  );
  const safePage = Math.min(page, totalPages);
  const pagedDisplayedWords = useMemo(() => {
    const start = (safePage - 1) * JP_VOCAB_PAGE_SIZE;
    return filteredDisplayedWords.slice(start, start + JP_VOCAB_PAGE_SIZE);
  }, [filteredDisplayedWords, safePage]);
  const showPagination = filteredDisplayedWords.length > JP_VOCAB_PAGE_SIZE;
  const pageRangeStart =
    filteredDisplayedWords.length === 0
      ? 0
      : (safePage - 1) * JP_VOCAB_PAGE_SIZE + 1;
  const pageRangeEnd = Math.min(
    safePage * JP_VOCAB_PAGE_SIZE,
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

  const searchActive = searchQuery.trim().length > 0;
  const filterActive = searchActive || kindFilter !== "all";

  const dailyTarget = Math.min(JP_VOCAB_DAILY_QUIZ_TOP, teacherVisibleWords.length);

  const dailyQuizProgress = useMemo(
    () => computeJpVocabDailyQuizProgress(displayOrder, teacherVisibleLimit.limit),
    [displayOrder, teacherVisibleLimit.limit]
  );

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

    const wasComplete = dailyQuizCompleteWasRef.current;
    dailyQuizCompleteWasRef.current = dailyQuizProgress.complete;

    if (!dailyQuizProgress.complete) return;
    if (!shouldShowJpVocabTeacherDailyComplete(user.id)) return;
    if (wasComplete === true) return;

    setShowDailyComplete(true);
  }, [
    canOperate,
    user?.id,
    dailyQuizProgress.complete,
    dailyQuizProgress.total,
  ]);

  const unmarkedCount = useMemo(
    () =>
      teacherVisibleWords.filter(
        (w) =>
          !effectiveJpVocabDisplayLevel(w, sessionLevel[w.id], { displayOrder })
      ).length,
    [teacherVisibleWords, sessionLevel, displayOrder]
  );

  const todayCheckStats = useMemo(
    () => jpVocabTodayCheckStats(words),
    [words]
  );

  const recordLevel = async (wordId: number, level: JpVocabLevel) => {
    if (!canOperate) {
      setStatus("请登录后再勾选熟悉程度。");
      openJpAuth();
      return;
    }
  if (savingId === wordId) return;

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

    setSessionLevel((prev) => ({ ...prev, [wordId]: level }));
    setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
    setDisplayOrder((prev) => markJpVocabRoundChecked(prev, wordId));
    setHighlightId(wordId);
    setStatus("");
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId ? bumpWordReview(w, level, prevLevel) : w
      )
    );
    setSavingId(wordId);

    try {
      await jpVocabSaveQueue.enqueue(async () => {
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
          error?: string;
        };
        if (res.status === 401) {
          await refresh();
          throw new Error(SAVE_ERR[locale]);
        }
        if (!data.ok || !data.word) {
          const msg =
            data.error || (locale === "zh" ? "保存失败" : "Save failed");
          throw new Error(msg);
        }
        setWords((prev) => {
          const next = prev.map((w) => (w.id === data.word!.id ? data.word! : w));
          persistVocabCache(next, refs, displayOrderRef.current);
          return next;
        });
      });
    } catch (err) {
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
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
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
    if (savingId === wordId) return;
    if (sharedTodayWordIds.has(wordId)) {
      setStatus("该词今日已共享。");
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
    const weakLevel: JpVocabLevel = "weak";
    const alreadyMarked =
      prevLevel != null ||
      effectiveTodayCheckCount(
        snapshot.today_check_count ?? 0,
        snapshot.today_check_date
      ) > 0;

    let nextDisplayOrder = displayOrderSnapshot;
    let nextWords = words;
    if (!alreadyMarked) {
      nextDisplayOrder = markJpVocabRoundChecked(displayOrderSnapshot, wordId);
      nextWords = words.map((w) =>
        w.id === wordId ? bumpWordReview(w, weakLevel, prevLevel) : w
      );
      setSessionLevel((prev) => ({ ...prev, [wordId]: weakLevel }));
      setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
      setDisplayOrder(nextDisplayOrder);
      setWords(nextWords);
    }

    const nextSharedIds = [...sharedIdsSnapshot, wordId];
    setSharedTodayWordIds(new Set(nextSharedIds));
    persistVocabCache(nextWords, refs, nextDisplayOrder, nextSharedIds);

    setHighlightId(wordId);
    setStatus(
      alreadyMarked
        ? "已共享到学生「今日背单词」。"
        : "已共享到学生「今日背单词」，并标记为不熟悉。"
    );
    notifyJpVocabSharedUpdated({ wordId, openRemarks: true });

    try {
      await jpVocabSaveQueue.enqueue(async () => {
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
          throw new Error(SAVE_ERR[locale]);
        }
        if (res.status === 409 || data.error === "already_shared_today") {
          return;
        }
        if (!data.ok || !data.word) {
          throw new Error(data.error || (locale === "zh" ? "共享失败" : "Share failed"));
        }
        setWords((prev) => {
          const next = prev.map((w) => (w.id === data.word!.id ? data.word! : w));
          persistVocabCache(
            next,
            refs,
            displayOrderRef.current,
            [...sharedTodayWordIdsRef.current]
          );
          return next;
        });
      });
    } catch (err) {
      setSharedTodayWordIds(new Set(sharedIdsSnapshot));
      if (snapshot && !alreadyMarked) {
        setWords((prev) =>
          prev.map((w) => (w.id === wordId ? snapshot : w))
        );
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
        persistVocabCache(
          words.map((w) => (w.id === wordId ? snapshot : w)),
          refs,
          displayOrderSnapshot,
          sharedIdsSnapshot
        );
      } else {
        persistVocabCache(words, refs, displayOrderSnapshot, sharedIdsSnapshot);
      }
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
    if (savingId === wordId) return;
    if (!sharedTodayWordIds.has(wordId)) {
      setStatus("该词今日尚未共享。");
      return;
    }

    const sharedIdsSnapshot = [...sharedTodayWordIdsRef.current];
    const nextSharedIds = sharedIdsSnapshot.filter((id) => id !== wordId);
    setSharedTodayWordIds(new Set(nextSharedIds));
    persistVocabCache(
      wordsRef.current,
      refsRef.current,
      displayOrderRef.current,
      nextSharedIds
    );

    setHighlightId(wordId);
    setStatus("已取消共享，学生「今日背单词」中不再显示该词。");
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
          throw new Error(SAVE_ERR[locale]);
        }
        if (res.status === 409 || data.error === "not_shared_today") {
          return;
        }
        if (!data.ok || !data.word) {
          throw new Error(data.error || (locale === "zh" ? "取消共享失败" : "Unshare failed"));
        }

        setWords((prev) => {
          const next = prev.map((w) => (w.id === data.word!.id ? data.word! : w));
          persistVocabCache(
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
      persistVocabCache(
        wordsRef.current,
        refsRef.current,
        displayOrderRef.current,
        sharedIdsSnapshot
      );
      setStatus(err instanceof Error ? err.message : String(err));
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
      if (action === "reset_today" && data.teacher_visible_limit) {
        setTeacherVisibleLimit(data.teacher_visible_limit);
        persistVocabCache(
          data.words,
          refs,
          data.display_order,
          undefined,
          data.teacher_visible_limit
        );
      } else {
        persistVocabCache(data.words, refs, data.display_order);
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
          ? "已今日重置：单词顺序已更新，当前轮次勾选已清空，老师可见范围已恢复为序号 1–20，统计次数保持不变。"
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
    const next = pickRandomWord(teacherVisibleWords, highlightId ?? undefined);
    if (!next) return;
    const idx = filteredDisplayedWords.findIndex((w) => w.id === next.id);
    if (idx >= 0) {
      setPage(Math.floor(idx / JP_VOCAB_PAGE_SIZE) + 1);
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
    persistVocabCache(nextWords, nextRefs, nextDisplayOrder);
    setStatus(
      `已添加：${added.word}${refDeduped ? "（共用教案链接）" : ""}`
    );
  };

  const handleWordSaved = useCallback(
    (word: JpVocabWord) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === word.id ? word : w));
        persistVocabCache(next, refs, displayOrderRef.current);
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
    (wordId: number, snapshot: JpVocabWord, message: string) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === wordId ? snapshot : w));
        persistVocabCache(next, refs, displayOrderRef.current);
        return next;
      });
      setStatus(message);
    },
    [refs]
  );

  const exportExcel = async () => {
    if (exporting || !displayedWords.length) return;
    setExporting(true);
    setStatus("");
    try {
      await exportJpVocabToExcel(displayedWords, refs, sessionLevel);
      setStatus(`已导出 ${displayedWords.length} 条到 Excel。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const expandTeacherVisible = async () => {
    if (!isAdmin || expandingTeacherVisible) return;
    setExpandingTeacherVisible(true);
    setStatus("");
    try {
      const res = await fetch("/api/jp-vocab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ action: "expand_teacher_visible" }),
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
      const prev = readVocabCache();
      if (prev) {
        writeClientCache(JP_VOCAB_CACHE_KEY, {
          ...prev,
          teacher_visible_limit: data.teacher_visible_limit,
        });
      }
      const nextLimit = data.teacher_visible_limit.limit;
      const prevFrom = nextLimit - JP_VOCAB_TEACHER_VISIBLE_STEP + 1;
      setStatus(
        `已释放 ${JP_VOCAB_TEACHER_VISIBLE_STEP} 条：序号 ${prevFrom}–${nextLimit}（老师共可见 ${jpVocabTeacherVisibleRangeLabel(nextLimit)}）。`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setExpandingTeacherVisible(false);
    }
  };

  const teacherVisibleRange = jpVocabTeacherVisibleRangeLabel(teacherVisibleLimit.limit);
  const teacherVisibleAtMax =
    teacherVisibleLimit.limit >= Math.max(displayOrder.ids.length, words.length);

  const openRefPreview = (refKey: string, ref?: JpVocabRef) => {
    const meta = resolveJpVocabRefForPreview(refKey, refs, ref);
    setPreviewRef({ ref: meta, cacheVersion: ref?.updated_at ?? refs[refKey]?.updated_at });
  };

  const renderPaginationNav = () =>
    showPagination ? (
      <nav className="jp-vocab-pagination" aria-label="单词表分页">
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage <= 1}
        >
          上一页
        </button>
        <span className="jp-vocab-pagination__info">
          第 {safePage} / {totalPages} 页 · 显示 {pageRangeStart}–{pageRangeEnd} /{" "}
          {filteredDisplayedWords.length} 条
        </span>
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
        >
          下一页
        </button>
      </nav>
    ) : null;

  return (
    <main className="page-wrap jp-vocab-page" style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>日语单词 / 语法抽问</h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        按序号抽查 → 提问后勾选熟悉程度 → 答不出或不熟悉时点「发给学生复习」（同时<strong>系统自动标记为不熟悉</strong>），供学生复习。
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

      {canOperate && dailyQuizProgress.total > 0 ? (
        <JpVocabDailyQuizProgressBar progress={dailyQuizProgress} variant="teacher" />
      ) : null}

      <section className="section etr-panel" aria-label="单词表">
        <div
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
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              共 {isAdmin ? words.length : teacherVisibleWords.length} 条
              {!isAdmin ? (
                <> · 今日可见序号 {teacherVisibleRange}</>
              ) : words.length ? (
                <> · 老师可见序号 {teacherVisibleRange}</>
              ) : null}
              {words.length ? (
                <>
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
                className="btn-rsi-filter btn-rsi-filter--primary"
                onClick={() => void expandTeacherVisible()}
                disabled={
                  loading ||
                  expandingTeacherVisible ||
                  !words.length ||
                  teacherVisibleAtMax
                }
                title={
                  teacherVisibleAtMax
                    ? "老师已可见全部词条"
                    : `当前老师可见序号 ${teacherVisibleRange}；点击后再释放 ${JP_VOCAB_TEACHER_VISIBLE_STEP} 条`
                }
              >
                {expandingTeacherVisible
                  ? "释放中…"
                  : teacherVisibleAtMax
                    ? "已全部释放"
                    : `释放${JP_VOCAB_TEACHER_VISIBLE_STEP}条`}
              </button>
            ) : null}
            {isAdmin ? (
              <button
                type="button"
                className="btn-rsi-filter"
                onClick={() => void exportExcel()}
                disabled={loading || exporting || !words.length}
                title="导出当前单词表为 Excel 文件"
              >
                {exporting ? "导出中…" : "导出 Excel"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={() => setShowRiskChart(true)}
              disabled={loading || !words.length}
              title="按抽查优先级查看知识点排行，辅助下节课抽查"
            >
              抽查排行
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={() => {
                if (!canOperate) {
                  setStatus("请登录后再手动添加。");
                  openJpAuth();
                  return;
                }
                setShowManualAdd(true);
              }}
              disabled={loading}
              title={canOperate ? undefined : "登录后可添加"}
            >
              手动添加
            </button>
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

        {status ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            {status}
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
                单词表默认按抽查优先级排序，每天北京时间 0 点重排一次；当天内勾选或刷新页面不会改变顺序（所有老师看到相同顺序）。非管理员老师默认仅可见当日序号 1–20，管理员可点「释放20条」逐步开放更多；跨日自动回到 20 条。管理员可使用「重置 → 今日重置」立即重排并清空当前轮次勾选，统计次数不变。
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
            暂无条目。复习词表由「日语新课」自动导入，也可登录后点「手动添加」补充。
          </p>
        ) : (
          <>
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="单词、读音、释义、词性…（本地即时搜索）"
                  disabled={loading}
                  autoComplete="off"
                  spellCheck={false}
                />
                <select
                  id="jp-vocab-kind-filter"
                  className="jp-vocab-search__kind"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as JpVocabKindFilter)}
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
                    }}
                  >
                    清除
                  </button>
                  <span className="jp-vocab-search__meta">
                    匹配 {filteredDisplayedWords.length} / {teacherVisibleWords.length} 条
                  </span>
                </>
              ) : null}
            </div>
            {filterActive && !filteredDisplayedWords.length ? (
              <p className="jp-vocab-search__empty">
                {searchActive
                  ? `没有匹配「${searchQuery.trim()}」的词条，请换个关键词试试。`
                  : kindFilter === "grammar"
                    ? "当前没有语法条目。"
                    : "当前没有单词条目。"}
              </p>
            ) : filteredDisplayedWords.length ? (
          <>
            {renderPaginationNav()}
          <div className="jp-vocab-table-wrap">
            <p className="jp-vocab-scroll-hint" aria-hidden="true">
              表格较宽时可左右滑动查看
            </p>
            <table className="compare-table etr-table jp-vocab-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="jp-vocab-seq-col">
                    序号
                  </th>
                  <th rowSpan={2} className="jp-vocab-kind-col">
                    类型
                  </th>
                  <th rowSpan={2} className="jp-vocab-word-col">
                    单词 / 语法
                  </th>
                  <th rowSpan={2} className="jp-vocab-reading-col">
                    读音
                  </th>
                  <th rowSpan={2} className="jp-vocab-meaning-col">
                    释义
                  </th>
                  <th rowSpan={2} className="jp-vocab-pos-col">
                    词性
                  </th>
                  <th rowSpan={2} className="jp-vocab-risk-col">
                    <button
                      type="button"
                      className="jp-vocab-sort-btn"
                      aria-sort={
                        statSort?.key === "risk"
                          ? statSort.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      title={`按${jpVocabPriorityLabel(locale)}排序（一般×1 + 不熟悉×2 − 非常熟悉×0.3）`}
                      onClick={() => toggleStatSort("risk")}
                    >
                      <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                        <span>抽查</span>
                        <span>优先级</span>
                      </span>
                      <span className="jp-vocab-sort-indicator" aria-hidden="true">
                        {statSort?.key === "risk"
                          ? statSort.dir === "asc"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th rowSpan={2} className="jp-vocab-level-col">
                    <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                      <span>熟悉程度</span>
                      <span className="jp-vocab-th-multiline__sub">(老师勾选)</span>
                    </span>
                  </th>
                  <th colSpan={4} className="jp-vocab-stats-group">
                    复习次数统计
                  </th>
                  <th rowSpan={2} className="jp-vocab-today-check-col" title="今日抽查次数">
                    <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                      <span>今日</span>
                      <span>抽查次数</span>
                    </span>
                  </th>
                  {SHOW_REMARKS_COLUMN ? (
                    <th rowSpan={2} className="jp-vocab-notes-col">
                      备注
                    </th>
                  ) : null}
                  <th rowSpan={2} className="jp-vocab-action-col">
                    操作
                  </th>
                </tr>
                <tr>
                  {STAT_SORT_COLUMNS.map((col) => {
                    const active = statSort?.key === col.key;
                    const ariaSort = active
                      ? statSort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none";
                    return (
                      <th key={col.key} className={col.className}>
                        <button
                          type="button"
                          className="jp-vocab-sort-btn"
                          aria-sort={ariaSort}
                          title={`按${col.label}排序`}
                          onClick={() => toggleStatSort(col.key)}
                        >
                          {col.labelLines ? (
                            <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                              <span>{col.labelLines[0]}</span>
                              <span>{col.labelLines[1]}</span>
                            </span>
                          ) : (
                            <span>{col.label}</span>
                          )}
                          <span className="jp-vocab-sort-indicator" aria-hidden="true">
                            {active ? (statSort.dir === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pagedDisplayedWords.map((w, rowIndex) => {
                  const isHighlight = highlightId === w.id;
                  const selected = effectiveJpVocabDisplayLevel(w, sessionLevel[w.id], {
                    displayOrder,
                  });
                  const isSaving = savingId === w.id;
                  const ref = w.ref_key ? refs[w.ref_key] : undefined;
                  const risk = jpVocabRiskIndex(w);
                  const todayChecks = effectiveTodayCheckCount(
                    w.today_check_count ?? 0,
                    w.today_check_date
                  );
                  const checkedInRound = jpVocabCheckedInRound(displayOrder, w);
                  const dailySeq = dailySeqByWordId.get(w.id) ?? rowIndex + 1;
                  const readingTrim = (w.reading || "").trim();
                  const meaningTrim = (w.meaning || "").trim();
                  const posTrim = (w.pos || "").trim();
                  const riskBadgeTier =
                    risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
                  const hasNotes = Boolean((w.class_notes || "").trim());
                  const renderNotesActions = () => (
                    <div className="jp-vocab-notes-actions">
                      {hasNotes ? (
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-notes-view-btn"
                          title="查看备注"
                          onClick={() => setViewingRemarksWord(w)}
                        >
                          查看
                        </button>
                      ) : null}
                      {canOperate ? (
                        <JpEditIconButton
                          title="编辑备注"
                          className="jp-vocab-notes-edit-btn"
                          onClick={() => setEditingRemarksWord(w)}
                        />
                      ) : null}
                    </div>
                  );

                  return (
                    <tr
                      key={w.id}
                      id={`jp-vocab-row-${w.id}`}
                      style={{
                        background: isHighlight
                          ? "rgba(61, 139, 253, 0.12)"
                          : undefined,
                      }}
                    >
                      <td className="jp-vocab-seq-col" data-label="序号">
                        <span className="jp-vocab-seq-cell">
                          <span className="jp-vocab-seq-num">{dailySeq}</span>
                          {checkedInRound ? (
                            <span
                              className="jp-vocab-seq-checked"
                              title="当前轮次已抽查"
                              aria-label={`序号 ${dailySeq}，当前轮次已抽查`}
                            >
                              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                                <path
                                  d="M2 6l3 3 5-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="jp-vocab-kind-col" data-label="类型">
                        <span
                          className={`jp-vocab-kind-badge${
                            w.kind === "grammar" ? " jp-vocab-kind-badge--grammar" : ""
                          }`}
                        >
                          {w.kind === "grammar" ? "语法" : "单词"}
                        </span>
                      </td>
                      <td className="jp-vocab-word-col" data-label="单词 / 语法">
                        <div className="jp-vocab-word-cell">
                          {w.ref_key ? (
                            <>
                              <button
                                type="button"
                                className="jp-vocab-word-link"
                                title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                                onClick={() => openRefPreview(w.ref_key!, ref)}
                              >
                                {w.word}
                              </button>
                              <span className="jp-vocab-ref-hint">（点击查看教案）</span>
                            </>
                          ) : (
                            <span className="jp-vocab-word-text">{w.word}</span>
                          )}
                        </div>
                        <div className="jp-vocab-mobile-reading-row jp-vocab-mobile-only">
                          {w.kind === "word" ? (
                            readingTrim ? (
                              <span className="jp-vocab-reading-text">{readingTrim}</span>
                            ) : (
                              <span className="jp-vocab-reading-text jp-vocab-reading-text--pending">
                                待补全
                              </span>
                            )
                          ) : readingTrim ? (
                            <span className="jp-vocab-reading-text">{readingTrim}</span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`jp-vocab-reading-col${
                          !readingTrim && w.kind !== "word" ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="读音"
                      >
                        <div className="jp-vocab-reading-cell">
                          {readingTrim ? (
                            <span className="jp-vocab-reading-text">{readingTrim}</span>
                          ) : w.kind === "word" ? (
                            <span className="jp-vocab-reading-text jp-vocab-reading-text--pending">
                              待补全
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`jp-vocab-meaning-col${
                          !meaningTrim ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="释义"
                        style={{ color: "var(--muted)" }}
                      >
                        {meaningTrim ? (
                          <>
                            <span className="jp-vocab-meaning-desktop">{meaningTrim}</span>
                            <details className="jp-vocab-meaning-fold jp-vocab-mobile-only">
                              <summary className="jp-vocab-meaning-fold__summary">
                                <span className="jp-vocab-fold-label">释义</span>
                                <span className="jp-vocab-meaning-preview">{meaningTrim}</span>
                              </summary>
                              <p className="jp-vocab-meaning-full">{meaningTrim}</p>
                            </details>
                          </>
                        ) : null}
                      </td>
                      <td
                        className={`jp-vocab-pos-col${!posTrim ? " jp-vocab-field-empty" : ""}`}
                        data-label="词性"
                        style={{ color: "var(--muted)" }}
                      >
                        {posTrim ? (
                          <span className="jp-vocab-pos-badge">{posTrim}</span>
                        ) : null}
                      </td>
                      <td className="jp-vocab-risk-col" data-label="优先级">
                        <span
                          className={`jp-vocab-risk-value jp-vocab-risk-badge jp-vocab-risk-badge--${riskBadgeTier}`}
                        >
                          {risk.toFixed(1)}
                        </span>
                      </td>
                      <td className="jp-vocab-level-col" data-label="熟悉程度">
                        <div
                          className="jp-vocab-levels"
                          role="group"
                          aria-label={`${w.word} 熟悉程度`}
                        >
                          {LEVELS.map((lv) => {
                            const checked = selected === lv.key;
                            return (
                              <button
                                key={lv.key}
                                type="button"
                                className={`jp-vocab-level-opt${
                                  checked ? " is-checked" : ""
                                }${
                                  !canOperate ? " jp-vocab-level-opt--readonly" : ""
                                }${lv.key === "very" ? " jp-vocab-level-opt--very" : ""}${
                                  lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                                }`}
                                disabled={!canOperate || isSaving}
                                title={
                                  !canOperate
                                    ? "登录后可勾选"
                                    : isSaving
                                      ? "保存中…"
                                      : checked
                                        ? "今日已选此项，可点其他选项改选"
                                        : selected
                                          ? "改选后以此为准，今日抽查次数不重复计"
                                          : "勾选熟悉程度"
                                }
                                aria-pressed={checked}
                                onClick={() => void recordLevel(w.id, lv.key)}
                              >
                                <span className="jp-vocab-check-box" aria-hidden="true">
                                  {checked ? (
                                    <svg viewBox="0 0 12 12" width="10" height="10">
                                      <path
                                        d="M2 6l3 3 5-5"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  ) : null}
                                </span>
                                <span>{lv.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="jp-vocab-stat-detail chg-dn" data-label="非常熟悉">
                        {w.cnt_very}
                      </td>
                      <td className="jp-vocab-stat-detail" data-label="一般">
                        {w.cnt_normal}
                      </td>
                      <td className="jp-vocab-stat-detail chg-up" data-label="不熟悉">
                        {w.cnt_weak}
                      </td>
                      <td className="jp-vocab-stat-total" data-label="复习合计">
                        {(() => {
                          const totalDisplay = formatJpVocabTotalReviewsDisplay(w, locale);
                          if (totalDisplay.isZero) {
                            return (
                              <span
                                className="jp-vocab-total-never"
                                title={jpVocabTotalReviewsZeroHint(locale)}
                              >
                                {totalDisplay.label}
                              </span>
                            );
                          }
                          return totalDisplay.label;
                        })()}
                      </td>
                      <td className="jp-vocab-today-check-col" data-label="今日抽查次数">
                        <span
                          className={`jp-vocab-today-check-value${
                            todayChecks > 0 ? " jp-vocab-today-check-value--active" : ""
                          }`}
                          title={todayChecks > 0 ? `今日已抽查 ${todayChecks} 次` : "今日尚未抽查"}
                        >
                          {todayChecks}
                        </span>
                      </td>
                      {SHOW_REMARKS_COLUMN ? (
                        <td
                          className={`jp-vocab-notes-col${
                            !hasNotes && !canOperate ? " jp-vocab-field-empty" : ""
                          }`}
                          data-label="备注"
                        >
                          <div className="jp-vocab-notes-desktop">{renderNotesActions()}</div>
                          <details className="jp-vocab-notes-fold jp-vocab-mobile-only">
                            <summary className="jp-vocab-notes-fold__summary">
                              <span className="jp-vocab-fold-label">备注</span>
                              <span className="jp-vocab-notes-fold__hint">
                                {hasNotes ? "查看 ›" : canOperate ? "编辑 ›" : "—"}
                              </span>
                            </summary>
                            {renderNotesActions()}
                          </details>
                        </td>
                      ) : null}
                      <td
                        className={`jp-vocab-action-col${!canOperate ? " jp-vocab-field-empty" : ""}`}
                        data-label="操作"
                      >
                        {canOperate ? (
                          <div className="jp-vocab-action-buttons">
                            {w.ref_key ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-mobile-action-btn--full jp-vocab-mobile-only"
                                title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                                onClick={() => openRefPreview(w.ref_key!, ref)}
                              >
                                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                                  <path
                                    d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v7A2.5 2.5 0 0 1 13.5 16h-7A2.5 2.5 0 0 1 4 13.5v-7Z"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                  />
                                  <path
                                    d="M8 10.5l1.5 1.5L12.5 9"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                查看教案
                              </button>
                            ) : null}
                            <div className="jp-vocab-action-row">
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn"
                                onClick={() => setEditingWord(w)}
                              >
                                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                                  <path
                                    d="M13.5 3.5l3 3L7 16H4v-3L13.5 3.5Z"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                编辑
                              </button>
                              {canShareToStudy ? (
                                sharedTodayWordIds.has(w.id) ? (
                                  <button
                                    type="button"
                                    className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-share-btn jp-vocab-unshare-btn jp-vocab-mobile-action-btn"
                                    disabled={isSaving}
                                    title="从学生「今日背单词」移除；若共享时自动标记了不熟悉，将一并撤销"
                                    onClick={() => void unshareWord(w.id)}
                                  >
                                    取消共享
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-share-btn jp-vocab-mobile-action-btn"
                                    disabled={isSaving}
                                    title="发给学生「今日背单词」，并标记为不熟悉"
                                    onClick={() => void shareWord(w.id)}
                                  >
                                    发给学生复习
                                  </button>
                                )
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            {renderPaginationNav()}
          </>
            ) : null}
          </>
        )}
      </section>

      <JpVocabResetChoiceModal
        open={showResetChoice}
        busy={resetting}
        onClose={() => setShowResetChoice(false)}
        onResetToday={resetToday}
        onResetAll={resetAll}
      />

      <JpVocabManualAddModal
        open={showManualAdd}
        locale={locale}
        onClose={() => setShowManualAdd(false)}
        onAdded={handleWordAdded}
      />

      <JpVocabRiskChartModal
        open={showRiskChart}
        words={teacherVisibleWords}
        onClose={() => setShowRiskChart(false)}
      />

      {user ? (
        <JpVocabDailyQuizIntroModal
          userId={user.id}
          open={showDailyIntro}
          dailyTarget={dailyTarget}
          dailyCheckedCount={dailyCheckedCount}
          onClose={() => setShowDailyIntro(false)}
        />
      ) : null}

      {user ? (
        <JpVocabDailyQuizCompleteModal
          open={showDailyComplete}
          total={dailyQuizProgress.total}
          variant="teacher"
          onClose={() => {
            markJpVocabTeacherDailyCompleteDismissed(user.id);
            setShowDailyComplete(false);
          }}
        />
      ) : null}

      <JpVocabRemarksViewModal
        open={viewingRemarksWord != null}
        word={viewingRemarksWord}
        onClose={() => setViewingRemarksWord(null)}
      />

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
        onClose={() => setEditingRemarksWord(null)}
        onSaved={handleWordSaved}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openJpAuth}
      />

      <JpVocabEditModal
        open={editingWord != null}
        word={editingWord}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingWord(null)}
        onSaved={handleWordSaved}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openJpAuth}
      />

      <style jsx>{`
        :global(.page-wrap:has(.jp-vocab-page)) {
          max-width: min(1480px, 96vw);
        }
        .jp-vocab-scroll-hint {
          display: none;
          margin: 0 0 0.5rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-today-summary-value {
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }
        .jp-vocab-today-summary-value--active {
          color: var(--accent);
          font-weight: 700;
        }
        .jp-vocab-help {
          margin-bottom: 0.75rem;
        }
        .jp-vocab-help-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--muted);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .jp-vocab-help-toggle:hover {
          color: var(--accent);
        }
        .jp-vocab-help-toggle-icon {
          font-size: 0.625rem;
          opacity: 0.7;
        }
        .jp-vocab-risk-hint {
          margin: 0.5rem 0 0;
          padding: 0.65rem 0.85rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
          font-size: 0.8125rem;
          line-height: 1.55;
          color: var(--muted);
        }
        .jp-vocab-risk-hint strong {
          color: var(--text);
        }
        .jp-vocab-search {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 0.65rem;
          margin: 0 0 0.75rem;
        }
        .jp-vocab-search__label {
          font-size: 0.875rem;
          color: var(--muted);
          flex-shrink: 0;
        }
        .jp-vocab-search__row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex: 1 1 auto;
          min-width: 0;
          max-width: 24rem;
        }
        .jp-vocab-search__kind {
          flex: 0 0 auto;
          width: 3.4rem;
          min-width: 3.4rem;
          padding: 0.45rem 1.15rem 0.45rem 0.35rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background-color: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%),
            linear-gradient(135deg, var(--muted) 50%, transparent 50%);
          background-position:
            calc(100% - 0.55rem) calc(50% + 0.12rem),
            calc(100% - 0.35rem) calc(50% + 0.12rem);
          background-size: 0.3rem 0.3rem;
          background-repeat: no-repeat;
          text-align: center;
          text-align-last: center;
        }
        .jp-vocab-search__kind:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .jp-vocab-search__kind:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .jp-vocab-search__input {
          flex: 1 1 auto;
          min-width: 0;
          width: auto;
          max-width: none;
          padding: 0.45rem 0.65rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
        }
        .jp-vocab-search__input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .jp-vocab-search__input:disabled {
          opacity: 0.6;
        }
        .jp-vocab-search__meta {
          font-size: 0.8125rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-search__empty {
          margin: 0 0 0.75rem;
          padding: 0.65rem 0.85rem;
          border-radius: 6px;
          border: 1px dashed var(--border);
          color: var(--muted);
          font-size: 0.875rem;
        }
        .jp-vocab-pagination {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.65rem 0.85rem;
          margin: 0 0 0.75rem;
        }
        .jp-vocab-pagination:last-of-type {
          margin: 0.75rem 0 0;
        }
        .jp-vocab-pagination__info {
          font-size: 0.8125rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          text-align: center;
        }
        .jp-vocab-levels {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem 0.5rem;
          min-width: 0;
        }
        .jp-vocab-level-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8125rem;
          cursor: pointer;
          white-space: nowrap;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text);
          font: inherit;
          line-height: 1.3;
          min-height: 2rem;
        }
        .jp-vocab-check-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1rem;
          height: 1rem;
          flex-shrink: 0;
          border: 1.5px solid var(--border);
          border-radius: 3px;
          background: var(--bg);
          color: var(--accent);
        }
        .jp-vocab-level-opt.is-checked .jp-vocab-check-box {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 18%, var(--bg));
        }
        .jp-vocab-level-opt--very.is-checked {
          color: var(--fall);
        }
        .jp-vocab-level-opt--very.is-checked .jp-vocab-check-box {
          border-color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, var(--bg));
          color: var(--fall);
        }
        .jp-vocab-level-opt--weak.is-checked {
          color: var(--rise);
        }
        .jp-vocab-level-opt--weak.is-checked .jp-vocab-check-box {
          border-color: var(--rise);
          background: color-mix(in srgb, var(--rise) 18%, var(--bg));
          color: var(--rise);
        }
        .jp-vocab-level-opt.is-checked {
          background: rgba(61, 139, 253, 0.08);
        }
        .jp-vocab-level-opt:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.04);
        }
        .jp-vocab-level-opt:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-vocab-level-opt--readonly:disabled {
          opacity: 0.72;
        }
        .jp-vocab-kind-badge {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
          white-space: nowrap;
        }
        .jp-vocab-kind-badge--grammar {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, transparent);
        }
        .jp-vocab-pos-badge {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
          white-space: nowrap;
          background: color-mix(in srgb, var(--panel) 88%, var(--bg));
        }
        .jp-vocab-mobile-only {
          display: none;
        }
        .jp-vocab-mobile-reading-row {
          display: none;
        }
        .jp-vocab-meaning-desktop {
          display: inline;
        }
        .jp-vocab-meaning-fold {
          display: none;
        }
        .jp-vocab-notes-desktop {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .jp-vocab-action-row {
          display: contents;
        }
        .jp-vocab-action-buttons .jp-vocab-mobile-action-btn svg,
        .jp-vocab-notes-actions .jp-vocab-mobile-action-btn svg {
          display: none;
        }
        .jp-vocab-ref-hint {
          display: block;
          margin-left: 0;
          margin-top: 0.2rem;
          font-size: 0.75rem;
          color: var(--muted);
          text-align: center;
        }
        .jp-vocab-word-link {
          font-weight: 500;
          color: var(--accent);
          text-decoration: underline;
          text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent);
          text-underline-offset: 2px;
          border: none;
          background: transparent;
          padding: 0;
          font: inherit;
          cursor: pointer;
        }
        .jp-vocab-word-link:hover {
          text-decoration: underline;
        }
        .jp-vocab-word-text {
          font-weight: 500;
        }
        .jp-vocab-word-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          flex: 1;
          min-width: 0;
        }
        :global(.jp-vocab-table-wrap) {
          display: block;
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        :global(.jp-vocab-table) {
          width: 100%;
          min-width: 900px;
        }
        :global(.jp-vocab-table th),
        :global(.jp-vocab-table td) {
          white-space: normal;
          vertical-align: middle;
          padding: 0.5rem 0.55rem;
          text-align: center;
        }
        :global(.jp-vocab-table thead th) {
          font-size: 0.8125rem;
          line-height: 1.3;
          overflow: hidden;
        }
        :global(.jp-vocab-table .jp-vocab-th-multiline) {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.05rem;
          line-height: 1.2;
          max-width: 100%;
        }
        :global(.jp-vocab-table .jp-vocab-th-multiline--compact) {
          font-size: 0.8125rem;
        }
        :global(.jp-vocab-table .jp-vocab-th-multiline__sub) {
          font-size: 0.8125em;
          color: var(--rise);
        }
        :global(.jp-vocab-table .jp-vocab-seq-col),
        :global(.jp-vocab-table .jp-vocab-kind-col),
        :global(.jp-vocab-table .jp-vocab-risk-col),
        :global(.jp-vocab-table .jp-vocab-stat-detail),
        :global(.jp-vocab-table .jp-vocab-stat-total),
        :global(.jp-vocab-table .jp-vocab-today-check-col),
        :global(.jp-vocab-table .jp-vocab-notes-col),
        :global(.jp-vocab-table .jp-vocab-action-col) {
          padding-left: 0.35rem;
          padding-right: 0.35rem;
        }
        :global(.jp-vocab-table .jp-vocab-level-col) {
          text-align: center;
          min-width: 8.75rem;
        }
        :global(.jp-vocab-table .jp-vocab-stats-group) {
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-sort-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.15rem;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          font-size: inherit;
          cursor: pointer;
          padding: 0;
        }
        :global(.jp-vocab-table .jp-vocab-sort-btn:hover) {
          color: var(--accent);
        }
        :global(.jp-vocab-table .jp-vocab-sort-indicator) {
          font-size: 0.6875rem;
          opacity: 0.45;
          line-height: 1;
        }
        :global(.jp-vocab-table .jp-vocab-sort-btn[aria-sort="ascending"] .jp-vocab-sort-indicator),
        :global(.jp-vocab-table .jp-vocab-sort-btn[aria-sort="descending"] .jp-vocab-sort-indicator) {
          opacity: 1;
          color: var(--accent);
        }
        :global(.jp-vocab-table .jp-vocab-stat-detail),
        :global(.jp-vocab-table .jp-vocab-stat-total),
        :global(.jp-vocab-table .jp-vocab-today-check-col),
        :global(.jp-vocab-table .jp-vocab-seq-col),
        :global(.jp-vocab-table .jp-vocab-kind-col),
        :global(.jp-vocab-table .jp-vocab-reading-col),
        :global(.jp-vocab-table .jp-vocab-meaning-col),
        :global(.jp-vocab-table .jp-vocab-pos-col),
        :global(.jp-vocab-table .jp-vocab-risk-col) {
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-risk-col) {
          white-space: nowrap;
          min-width: 3.5rem;
        }
        :global(.jp-vocab-table .jp-vocab-risk-value) {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-vocab-table .jp-vocab-stat-detail) {
          min-width: 2.85rem;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-vocab-table .jp-vocab-stat-total) {
          white-space: nowrap;
          min-width: 2.75rem;
        }
        :global(.jp-vocab-table .jp-vocab-total-never) {
          color: var(--muted);
          font-size: 0.8125rem;
          letter-spacing: 0.02em;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-col) {
          white-space: nowrap;
          min-width: 3.75rem;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-value) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.35rem;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
        }
        :global(.jp-vocab-table .jp-vocab-today-check-value--active) {
          min-width: 1.5rem;
          padding: 0.12rem 0.4rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent) 22%, transparent);
          color: var(--accent);
          font-weight: 700;
          font-size: 0.9375rem;
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
        }
        :global(.jp-vocab-table .jp-vocab-word-col) {
          font-size: 0.9375rem;
          min-width: 7rem;
          padding-left: 0.65rem;
          padding-right: 0.65rem;
        }
        :global(.jp-vocab-table .jp-vocab-reading-col) {
          min-width: 6.5rem;
          padding-left: 0.65rem;
          padding-right: 0.65rem;
          word-break: break-word;
          line-height: 1.45;
        }
        .jp-vocab-reading-cell {
          display: inline-flex;
          align-items: flex-start;
          gap: 0.4rem;
          color: var(--muted);
        }
        .jp-vocab-reading-text {
          flex: 1 1 auto;
          min-width: 0;
        }
        .jp-vocab-reading-text--pending {
          font-size: 0.8125rem;
          opacity: 0.72;
        }
        :global(.jp-vocab-table .jp-vocab-meaning-col) {
          min-width: 6.5rem;
          padding-left: 0.65rem;
          padding-right: 0.65rem;
          word-break: break-word;
          line-height: 1.45;
        }
        :global(.jp-vocab-table .jp-vocab-pos-col) {
          min-width: 4rem;
        }
        :global(.jp-vocab-table .jp-vocab-notes-col) {
          min-width: 6.5rem;
          white-space: nowrap;
        }
        :global(.jp-vocab-table thead .jp-vocab-notes-col) {
          text-align: center;
          vertical-align: middle;
        }
        :global(.jp-vocab-table tbody .jp-vocab-notes-col) {
          text-align: center;
          vertical-align: middle;
        }
        .jp-vocab-notes-actions {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          flex-wrap: wrap;
        }
        :global(.jp-vocab-table .jp-vocab-action-col) {
          white-space: nowrap;
          min-width: 7.5rem;
        }
        .jp-vocab-action-buttons {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
        }
        .jp-vocab-share-btn:not(:disabled):not(.jp-vocab-unshare-btn) {
          color: #f0a840;
          border-color: color-mix(in srgb, #f0a840 45%, var(--border));
        }
        .jp-vocab-share-btn:not(:disabled):not(.jp-vocab-unshare-btn):hover {
          color: #ffc860;
          border-color: color-mix(in srgb, #f0a840 65%, var(--border));
        }
        :global(.jp-vocab-table .jp-vocab-kind-col) {
          white-space: nowrap;
          min-width: 3rem;
        }
        :global(.jp-vocab-table .jp-vocab-seq-col) {
          white-space: nowrap;
          min-width: 2.5rem;
          color: var(--muted);
        }
        :global(.jp-vocab-table .jp-vocab-seq-cell) {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.12rem;
          min-height: 1.75rem;
        }
        :global(.jp-vocab-table .jp-vocab-seq-checked) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1rem;
          height: 1rem;
          border-radius: 999px;
          color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--fall) 35%, transparent);
        }
        :global(.jp-vocab-table .jp-vocab-seq-num) {
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }

        /* 中等屏幕：隐藏分项统计，保留合计，减少横向滚动 */
        @media (max-width: 1100px) {
          .jp-vocab-scroll-hint {
            display: block;
          }
          :global(.jp-vocab-table .jp-vocab-stat-detail) {
            display: none;
          }
          :global(.jp-vocab-table thead tr:nth-child(2) .jp-vocab-stat-detail) {
            display: none;
          }
        }

        /* 手机 / 小屏：紧凑卡片布局 */
        @media (max-width: 768px) {
          .jp-vocab-scroll-hint {
            display: none;
          }
          :global(.jp-vocab-page) {
            padding-top: 0.75rem !important;
          }
          :global(.jp-vocab-table) {
            min-width: 0;
          }
          :global(.jp-vocab-table thead) {
            display: none;
          }
          :global(.jp-vocab-table tbody tr) {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.5rem 0.75rem;
            margin-bottom: 0.625rem;
            padding: 0.875rem 1rem;
            border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
            border-radius: 15px;
            background: color-mix(in srgb, var(--panel) 94%, var(--bg));
          }
          :global(.jp-vocab-table tbody td) {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            gap: 0.25rem;
            padding: 0;
            border: none;
            text-align: left;
            line-height: 1.35;
            min-width: 0;
          }
          :global(.jp-vocab-table tbody td::before) {
            content: attr(data-label) "：";
            flex: 0 0 auto;
            font-size: clamp(0.8125rem, 3.2vw, 0.9375rem);
            font-weight: 400;
            color: var(--muted);
            white-space: nowrap;
          }
          :global(.jp-vocab-table tbody td.jp-vocab-field-empty) {
            display: none;
          }
          :global(.jp-vocab-table tbody td > *) {
            flex: 1;
            min-width: 0;
            font-size: clamp(0.875rem, 3.4vw, 1rem);
          }
          :global(.jp-vocab-table .jp-vocab-seq-num) {
            font-size: clamp(0.875rem, 3.4vw, 1rem);
            font-weight: 600;
          }
          :global(.jp-vocab-table .jp-vocab-word-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
            padding: 0 0 0.5rem;
            margin-bottom: 0.125rem;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-word-col::before) {
            display: none;
          }
          .jp-vocab-word-cell {
            text-align: left;
            width: 100%;
            align-items: flex-start;
          }
          .jp-vocab-word-link,
          .jp-vocab-word-text {
            font-size: clamp(1.5rem, 6.5vw, 1.75rem);
            font-weight: 700;
            line-height: 1.2;
            text-align: left;
          }
          .jp-vocab-mobile-only {
            display: block;
          }
          .jp-vocab-notes-desktop {
            display: none;
          }
          .jp-vocab-mobile-reading-row {
            display: flex;
            align-items: center;
            gap: 0.375rem;
            width: 100%;
          }
          .jp-vocab-mobile-reading-row:empty {
            display: none;
            min-height: 0;
          }
          .jp-vocab-mobile-reading-row .jp-vocab-reading-text {
            font-size: clamp(0.875rem, 3.5vw, 1rem);
            color: var(--muted);
          }
          .jp-vocab-ref-hint {
            display: block;
            width: 100%;
            margin: 0;
            text-align: left;
            font-size: clamp(0.6875rem, 2.8vw, 0.75rem);
            color: color-mix(in srgb, var(--muted) 85%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-seq-col) {
            display: flex !important;
            grid-column: 1;
          }
          :global(.jp-vocab-table .jp-vocab-seq-col::before) {
            content: "编号：";
          }
          :global(.jp-vocab-table .jp-vocab-kind-col) {
            grid-column: 2;
          }
          :global(.jp-vocab-table .jp-vocab-kind-col::before) {
            content: "类型：";
          }
          :global(.jp-vocab-table .jp-vocab-reading-col) {
            display: none !important;
          }
          :global(.jp-vocab-table .jp-vocab-meaning-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: stretch;
            gap: 0;
          }
          :global(.jp-vocab-table .jp-vocab-meaning-col::before) {
            display: none;
          }
          .jp-vocab-meaning-desktop {
            display: none;
          }
          .jp-vocab-meaning-fold {
            display: block;
            width: 100%;
          }
          .jp-vocab-meaning-fold__summary {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0.125rem;
            list-style: none;
            cursor: pointer;
            padding: 0.375rem 0;
          }
          .jp-vocab-meaning-fold__summary::-webkit-details-marker {
            display: none;
          }
          .jp-vocab-fold-label {
            font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
            color: var(--muted);
            font-weight: 500;
          }
          .jp-vocab-meaning-preview {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            overflow: hidden;
            font-size: clamp(0.8125rem, 3vw, 0.9375rem);
            color: var(--muted);
            line-height: 1.4;
            width: 100%;
          }
          .jp-vocab-meaning-fold[open] .jp-vocab-meaning-preview {
            display: none;
          }
          .jp-vocab-meaning-full {
            margin: 0;
            font-size: clamp(0.8125rem, 3vw, 0.9375rem);
            color: var(--muted);
            line-height: 1.45;
          }
          :global(.jp-vocab-table .jp-vocab-pos-col) {
            grid-column: 1;
          }
          :global(.jp-vocab-table .jp-vocab-pos-col::before) {
            content: "词性：";
          }
          :global(.jp-vocab-table .jp-vocab-risk-col) {
            grid-column: 2;
          }
          :global(.jp-vocab-table .jp-vocab-risk-col::before) {
            content: "优先级：";
          }
          :global(.jp-vocab-table .jp-vocab-level-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: stretch;
            gap: 0.375rem;
            padding-top: 0.375rem;
            margin-top: 0.125rem;
            border-top: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-level-col::before) {
            flex: 0 0 auto;
            width: auto;
            max-width: none;
            font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
            font-weight: 500;
          }
          :global(.jp-vocab-table .jp-vocab-kind-badge),
          .jp-vocab-pos-badge {
            flex: 0 0 auto;
            font-size: clamp(0.75rem, 3vw, 0.875rem) !important;
            padding: 0.1875rem 0.5rem !important;
            border-radius: 999px !important;
            border: 1px solid var(--border) !important;
            background: color-mix(in srgb, var(--panel) 88%, var(--bg)) !important;
            color: var(--text) !important;
            white-space: nowrap;
          }
          :global(.jp-vocab-table .jp-vocab-kind-badge--grammar) {
            color: var(--accent) !important;
            border-color: color-mix(in srgb, var(--accent) 35%, var(--border)) !important;
            background: color-mix(in srgb, var(--accent) 10%, var(--panel)) !important;
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge) {
            display: inline-flex !important;
            align-items: center;
            flex: 0 0 auto !important;
            padding: 0.125rem 0.4375rem;
            border-radius: 999px;
            font-size: clamp(0.75rem, 3vw, 0.875rem) !important;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            border: 1px solid var(--border);
            background: color-mix(in srgb, var(--panel) 88%, var(--bg));
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge--low) {
            color: var(--fall);
            border-color: color-mix(in srgb, var(--fall) 30%, var(--border));
            background: color-mix(in srgb, var(--fall) 12%, var(--panel));
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge--mid) {
            color: var(--accent);
            border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
            background: color-mix(in srgb, var(--accent) 12%, var(--panel));
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge--high) {
            color: var(--rise);
            border-color: color-mix(in srgb, var(--rise) 30%, var(--border));
            background: color-mix(in srgb, var(--rise) 12%, var(--panel));
          }
          .jp-vocab-levels {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0;
            width: 100%;
            border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
            border-radius: 10px;
            overflow: hidden;
            background: color-mix(in srgb, var(--bg) 60%, var(--panel));
          }
          .jp-vocab-level-opt {
            min-height: 2.75rem;
            padding: 0.375rem 0.25rem;
            flex: 1 1 0;
            justify-content: center;
            font-size: clamp(0.6875rem, 2.8vw, 0.8125rem);
            border: none;
            border-radius: 0;
            border-right: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
            background: transparent;
            white-space: nowrap;
          }
          .jp-vocab-level-opt:last-child {
            border-right: none;
          }
          .jp-vocab-check-box {
            display: none;
          }
          .jp-vocab-level-opt.is-checked {
            background: color-mix(in srgb, var(--accent) 18%, var(--panel));
            color: var(--accent);
            font-weight: 600;
          }
          .jp-vocab-level-opt--very.is-checked {
            background: color-mix(in srgb, var(--fall) 16%, var(--panel));
            color: var(--fall);
          }
          .jp-vocab-level-opt--weak.is-checked {
            background: color-mix(in srgb, var(--rise) 16%, var(--panel));
            color: var(--rise);
          }
          :global(.jp-vocab-table .jp-vocab-stat-detail),
          :global(.jp-vocab-table .jp-vocab-stat-total),
          :global(.jp-vocab-table .jp-vocab-today-check-col) {
            display: none;
          }
          :global(.jp-vocab-table .jp-vocab-notes-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: stretch;
            padding-top: 0.25rem;
            border-top: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-notes-col::before) {
            display: none;
          }
          .jp-vocab-notes-fold {
            width: 100%;
          }
          .jp-vocab-notes-fold > summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            min-height: 2.75rem;
            list-style: none;
            cursor: pointer;
            padding: 0.125rem 0;
          }
          .jp-vocab-notes-fold > summary::-webkit-details-marker {
            display: none;
          }
          .jp-vocab-notes-fold__hint {
            font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
            color: var(--accent);
          }
          .jp-vocab-notes-fold:not([open]) .jp-vocab-notes-actions {
            display: none;
          }
          .jp-vocab-notes-actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding-bottom: 0.25rem;
          }
          :global(.jp-vocab-table .jp-vocab-action-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: stretch;
            padding-top: 0.25rem;
          }
          :global(.jp-vocab-table .jp-vocab-action-col::before) {
            display: none;
          }
          .jp-vocab-action-buttons {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            width: 100%;
          }
          .jp-vocab-action-row {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem;
            width: 100%;
          }
          .jp-vocab-action-row > :only-child {
            grid-column: 1 / -1;
          }
          :global(.jp-vocab-mobile-action-btn) {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            gap: 0.375rem;
            min-height: 2.75rem;
            width: 100%;
            font-size: clamp(0.8125rem, 3vw, 0.875rem);
            border-radius: 10px;
          }
          :global(.jp-vocab-mobile-action-btn--full) {
            grid-column: 1 / -1;
          }
          .jp-vocab-action-buttons .jp-vocab-mobile-action-btn svg,
          .jp-vocab-notes-actions .jp-vocab-mobile-action-btn svg {
            display: block;
            flex-shrink: 0;
          }
          :global(.jp-vocab-table .jp-vocab-notes-col.jp-vocab-field-empty) {
            display: none;
          }
        }

        @media (max-width: 480px) {
          :global(.jp-vocab-table tbody tr) {
            padding: 0.75rem 0.875rem;
            gap: 0.4375rem 0.625rem;
          }
        }
      `}</style>
    </main>
  );
}
