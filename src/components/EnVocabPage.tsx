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
  enVocabRiskIndex,
  formatEnVocabTotalReviewsDisplay,
  enVocabTotalReviewsZeroHint,
  sortEnVocabWordsForDisplay,
  type EnVocabStatSortKey,
} from "@/lib/en-vocab-shared";
import {
  buildEnVocabDailySeqMap,
  isEnVocabRoundChecked,
  markEnVocabRoundChecked,
  type EnVocabDailyDisplayOrder,
} from "@/lib/en-vocab-daily-order";
import {
  filterEnVocabWordsBySearch,
  type EnVocabKindFilter,
} from "@/lib/en-vocab-search";
import { EnVocabSpeakButton } from "@/components/EnVocabSpeakButton";
import { EnVocabExampleSentencesCell } from "@/components/EnVocabExampleSentencesCell";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { EnVocabEditModal } from "@/components/EnVocabEditModal";
import { EnClassNotesEditModal } from "@/components/EnClassNotesEditModal";
import { EnEditIconButton } from "@/components/EnEditIconButton";
import { EnVocabRemarksViewModal } from "@/components/EnVocabRemarksViewModal";
import { EnVocabManualAddModal } from "@/components/EnVocabManualAddModal";
import { EnVocabRiskChartModal } from "@/components/EnVocabRiskChartModal";
import {
  EnVocabDailyQuizIntroModal,
  shouldShowEnVocabDailyIntro,
} from "@/components/EnVocabDailyQuizIntroModal";
import { EnVocabResetChoiceModal } from "@/components/EnVocabResetChoiceModal";
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
import { exportEnVocabToExcel } from "@/lib/en-vocab-export";
import {
  effectiveTodayCheckCount,
  enVocabTodayCheckStats,
} from "@/lib/en-vocab-daily-check";
import { applyEnVocabReview } from "@/lib/en-vocab-review";
import { EnVocabRefPreviewModal } from "@/components/EnVocabRefPreviewModal";
import { resolveEnVocabRefForPreview } from "@/lib/en-vocab-ref-shared";
import { notifyEnVocabSharedUpdated } from "@/lib/en-vocab-shared-notify";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";

function readVocabCache(): EnVocabApiPayload | null {
  return readClientCache<EnVocabApiPayload>(JP_VOCAB_CACHE_KEY);
}

function persistVocabCache(
  words: EnVocabWord[],
  refs: Record<string, EnVocabRef>,
  display_order: EnVocabDailyDisplayOrder,
  shared_today_word_ids?: number[]
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
  });
}

const LEVELS: { key: EnVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

const STAT_SORT_COLUMNS: {
  key: EnVocabStatSortKey;
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

/** 按当前排序，每日建议优先抽查的前 N 条 */
const JP_VOCAB_DAILY_QUIZ_TOP = 20;

/** 单词表每页条数 */
const JP_VOCAB_PAGE_SIZE = 100;

function enVocabCheckedInRound(
  order: EnVocabDailyDisplayOrder,
  word: EnVocabWord
): boolean {
  return isEnVocabRoundChecked(order, word.id);
}

function enVocabWordsInOrder(
  words: EnVocabWord[],
  order: number[]
): EnVocabWord[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  const seen = new Set<number>();
  const ordered: EnVocabWord[] = [];
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

function pickRandomWord(words: EnVocabWord[], excludeId?: number): EnVocabWord | null {
  if (!words.length) return null;
  const pool =
    excludeId != null && words.length > 1
      ? words.filter((w) => w.id !== excludeId)
      : words;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function bumpWordReview(
  word: EnVocabWord,
  level: EnVocabLevel,
  previousLevel?: EnVocabLevel
): EnVocabWord {
  return applyEnVocabReview(word, level, new Date(), previousLevel).word;
}

const SAVE_ERR = {
  en: "Please log in to save changes.",
  zh: "请登录后再操作。",
};

type EnVocabPageVariant = "teacher" | "admin";

type EnVocabPageProps = {
  variant: EnVocabPageVariant;
};

export function EnVocabPage({ variant }: EnVocabPageProps) {
  const { locale } = useI18n();
  const router = useRouter();
  const {
    user,
    checking,
    canAccessEnVocab,
    canAccessEnVocabTeacherPage,
    canAccessEnVocabAdminPage,
    canAccessEnVocabStudy,
    refresh,
    openAuthPanel,
    isAdmin,
  } = useEtrAuth();
  /** 产品模式：由路由 variant 驱动，不再用 isAdmin 兼做老师/管理员 UX */
  const isAdminMode = variant === "admin";
  const isTeacherMode = variant === "teacher";
  const canOperate = canAccessEnVocab;
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
  const [words, setWords] = useState<EnVocabWord[]>([]);
  const [refs, setRefs] = useState<Record<string, EnVocabRef>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetChoice, setShowResetChoice] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [sharedTodayWordIds, setSharedTodayWordIds] = useState<Set<number>>(
    () => new Set(readVocabCache()?.shared_today_word_ids ?? [])
  );
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  /** 本轮复习：每词当前勾选（仅前端，重置后清空） */
  const [sessionLevel, setSessionLevel] = useState<
    Record<number, EnVocabLevel | undefined>
  >({});
  /** 本轮每词最近一次勾选时间（毫秒，用于 15 秒内改选修正） */
  const [sessionReviewAt, setSessionReviewAt] = useState<Record<number, number>>({});
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [editingWord, setEditingWord] = useState<EnVocabWord | null>(null);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<EnVocabWord | null>(null);
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
  const [displayOrder, setDisplayOrder] = useState<EnVocabDailyDisplayOrder>({
    date: "",
    ids: [],
    round_checked_ids: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<EnVocabKindFilter>("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<number>>(
    () => new Set()
  );
  const [showRiskChart, setShowRiskChart] = useState(false);
  const [showDailyIntro, setShowDailyIntro] = useState(false);
  const [showVocabHelp, setShowVocabHelp] = useState(false);
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

  const applyVocabPayload = useCallback((payload: EnVocabApiPayload) => {
    setWords(payload.words);
    setRefs(payload.refs);
    setDisplayOrder(payload.display_order);
    setSharedTodayWordIds(new Set(payload.shared_today_word_ids ?? []));
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
        "/api/en-vocab",
        parseEnVocabApi,
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

  const applySyncPatches = useCallback((patches: EnVocabWord[]) => {
    if (!patches.length) return;
    setWords((prev) => {
      const next = mergeEnVocabSyncPatches(prev, patches);
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

      const since = maxEnVocabUpdatedAt(wordsRef.current);
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
          `/api/en-vocab/sync?since=${encodeURIComponent(since)}`,
          { credentials: "include" }
        );
        const data = (await res.json()) as {
          ok: boolean;
          words?: EnVocabWord[];
        };
        if (data.ok && Array.isArray(data.words) && data.words.length) {
          applySyncPatches(data.words);
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
  }, [loading, words.length, applySyncPatches]);

  const displayedWords = useMemo(() => {
    if (useDailyRowOrder && displayOrder.ids.length > 0) {
      return enVocabWordsInOrder(words, displayOrder.ids);
    }
    return sortEnVocabWordsForDisplay(words, statSort);
  }, [words, statSort, displayOrder.ids, useDailyRowOrder]);

  const filteredDisplayedWords = useMemo(
    () => filterEnVocabWordsBySearch(displayedWords, searchQuery, kindFilter),
    [displayedWords, searchQuery, kindFilter]
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
  const pagedDeleteIds = useMemo(
    () => pagedDisplayedWords.map((w) => w.id),
    [pagedDisplayedWords]
  );
  const allPageDeleteSelected =
    pagedDeleteIds.length > 0 &&
    pagedDeleteIds.every((id) => selectedDeleteIds.has(id));
  const somePageDeleteSelected =
    !allPageDeleteSelected && pagedDeleteIds.some((id) => selectedDeleteIds.has(id));
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

  /** 当日固定序号：来自服务端 display_order，不随列头排序变化 */
  const dailySeqByWordId = useMemo(
    () => buildEnVocabDailySeqMap(displayOrder.ids),
    [displayOrder.ids]
  );

  const searchActive = searchQuery.trim().length > 0;
  const filterActive = searchActive || kindFilter !== "all";

  const dailyTarget = Math.min(JP_VOCAB_DAILY_QUIZ_TOP, words.length);

  const dailyCheckedCount = useMemo(() => {
    if (!displayedWords.length) return 0;
    return displayedWords
      .slice(0, dailyTarget)
      .filter((w) => enVocabCheckedInRound(displayOrder, w)).length;
  }, [displayedWords, dailyTarget, displayOrder]);

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
    () => words.filter((w) => !sessionLevel[w.id]).length,
    [words, sessionLevel]
  );

  const todayCheckStats = useMemo(
    () => enVocabTodayCheckStats(words),
    [words]
  );

  const recordLevel = async (wordId: number, level: EnVocabLevel) => {
    if (!canOperate) {
      setStatus("请登录后再勾选熟悉程度。");
      openEnAuth();
      return;
    }
    if (sharedTodayWordIds.has(wordId)) {
      setStatus("今日已共享，熟悉程度不可更改。");
      return;
    }
    if (savingId === wordId) return;

    const snapshot = words.find((w) => w.id === wordId);
    if (!snapshot) return;
    const prevLevel = sessionLevel[wordId];
    const prevReviewAt = sessionReviewAt[wordId];
    const displayOrderSnapshot = displayOrderRef.current;
    const nowMs = Date.now();

    setSessionLevel((prev) => ({ ...prev, [wordId]: level }));
    setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
    setDisplayOrder((prev) => markEnVocabRoundChecked(prev, wordId));
    setHighlightId(wordId);
    setStatus("");
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId ? bumpWordReview(w, level, prevLevel) : w
      )
    );
    setSavingId(wordId);

    try {
      await enVocabSaveQueue.enqueue(async () => {
        const res = await fetch("/api/en-vocab", {
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
          word?: EnVocabWord;
          error?: string;
        };
        if (res.status === 401) {
          await refresh();
          throw new Error(SAVE_ERR[locale]);
        }
        if (!data.ok || !data.word) {
          const msg =
            data.error === "shared_level_locked"
              ? "今日已共享，熟悉程度不可更改。"
              : data.error || (locale === "zh" ? "保存失败" : "Save failed");
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
    if (!teacherShareUiEnabled) {
      setStatus("当前页面不可共享单词。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再共享。");
      openEnAuth();
      return;
    }
    if (sharingId === wordId || savingId === wordId) return;
    if (sharedTodayWordIds.has(wordId)) {
      setStatus("该词今日已共享。");
      return;
    }

    const snapshot = words.find((w) => w.id === wordId);
    if (!snapshot) return;
    const prevLevel = sessionLevel[wordId];
    const prevReviewAt = sessionReviewAt[wordId];
    const displayOrderSnapshot = displayOrderRef.current;
    const nowMs = Date.now();
    const weakLevel: EnVocabLevel = "weak";
    const alreadyMarked =
      prevLevel != null ||
      effectiveTodayCheckCount(
        snapshot.today_check_count ?? 0,
        snapshot.today_check_date
      ) > 0;

    setHighlightId(wordId);
    setStatus("");
    if (!alreadyMarked) {
      setSessionLevel((prev) => ({ ...prev, [wordId]: weakLevel }));
      setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
      setDisplayOrder((prev) => markEnVocabRoundChecked(prev, wordId));
      setWords((prev) =>
        prev.map((w) =>
          w.id === wordId ? bumpWordReview(w, weakLevel, prevLevel) : w
        )
      );
    }
    setSharingId(wordId);

    try {
      const res = await fetch("/api/en-vocab/share", {
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
        word?: EnVocabWord;
        error?: string;
      };
      if (res.status === 401) {
        await refresh();
        throw new Error(SAVE_ERR[locale]);
      }
      if (res.status === 409 || data.error === "already_shared_today") {
        setSharedTodayWordIds((prev) => new Set([...prev, wordId]));
        throw new Error("该词今日已共享。");
      }
      if (!data.ok || !data.word) {
        throw new Error(data.error || (locale === "zh" ? "共享失败" : "Share failed"));
      }
      setSharedTodayWordIds((prev) => new Set([...prev, wordId]));
      setWords((prev) => {
        const next = prev.map((w) => (w.id === data.word!.id ? data.word! : w));
        persistVocabCache(
          next,
          refs,
          displayOrderRef.current,
          [...sharedTodayWordIdsRef.current, wordId]
        );
        return next;
      });
      setStatus(
        alreadyMarked
          ? "已共享到学生「今日背英语单词」。"
          : "已共享到学生「今日背英语单词」，并标记为不熟悉。"
      );
      notifyEnVocabSharedUpdated({ wordId, openRemarks: true });
    } catch (err) {
      if (snapshot && !alreadyMarked) {
        setWords((prev) =>
          prev.map((w) => (w.id === wordId ? snapshot : w))
        );
      }
      if (!alreadyMarked) {
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
      }
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSharingId(null);
    }
  };

  const runReset = async (action: "reset_today" | "reset") => {
    setResetting(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/en-vocab", {
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
        words?: EnVocabWord[];
        display_order?: EnVocabDailyDisplayOrder;
        error?: string;
      };
      if (!data.ok || !data.words || !data.display_order) {
        throw new Error(data.error || "重置失败");
      }
      setWords(data.words);
      setDisplayOrder(data.display_order);
      persistVocabCache(data.words, refs, data.display_order);
      setSessionLevel({});
      setSessionReviewAt({});
      setUseDailyRowOrder(true);
      setStatSort(JP_VOCAB_DEFAULT_STAT_SORT);
      setHighlightId(null);
      setPage(1);
      setShowResetChoice(false);
      setStatus(
        action === "reset_today"
          ? "已今日重置：单词顺序已更新，当前轮次勾选已清空，统计次数保持不变。"
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
      openEnAuth();
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
    const next = pickRandomWord(words, highlightId ?? undefined);
    if (!next) return;
    const idx = filteredDisplayedWords.findIndex((w) => w.id === next.id);
    if (idx >= 0) {
      setPage(Math.floor(idx / JP_VOCAB_PAGE_SIZE) + 1);
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
    persistVocabCache(nextWords, nextRefs, nextDisplayOrder);
    setStatus(
      `已添加：${added.word}${refDeduped ? "（共用教案链接）" : ""}`
    );
  };

  const handleWordSaved = useCallback(
    (word: EnVocabWord) => {
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
    (wordId: number, snapshot: EnVocabWord, message: string) => {
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
      await exportEnVocabToExcel(displayedWords, refs, sessionLevel);
      setStatus(`已导出 ${displayedWords.length} 条到 Excel。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const openRefPreview = (refKey: string, ref?: EnVocabRef) => {
    const meta = resolveEnVocabRefForPreview(refKey, refs, ref);
    setPreviewRef({ ref: meta, cacheVersion: ref?.updated_at ?? refs[refKey]?.updated_at });
  };

  const toggleDeleteSelection = (wordId: number, checked: boolean) => {
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(wordId);
      else next.delete(wordId);
      return next;
    });
  };

  const toggleSelectAllPageForDelete = () => {
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      if (allPageDeleteSelected) {
        for (const id of pagedDeleteIds) next.delete(id);
      } else {
        for (const id of pagedDeleteIds) next.add(id);
      }
      return next;
    });
  };

  const batchDeleteSelected = async () => {
    if (!isAdminMode) {
      setStatus("仅管理员端可删除词条。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再删除。");
      openEnAuth();
      return;
    }
    if (deletingBatch || selectedDeleteIds.size === 0) return;

    const ids = [...selectedDeleteIds];
    const ok = window.confirm(
      `确定删除选中的 ${ids.length} 条词条？此操作不可恢复。`
    );
    if (!ok) return;

    setDeletingBatch(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/en-vocab/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ word_ids: ids }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        deleted?: number;
        words?: EnVocabWord[];
        display_order?: EnVocabDailyDisplayOrder;
        error?: string;
      };
      if (res.status === 403) {
        throw new Error("仅 Admin 账户可删除词条。");
      }
      if (!data.ok || !data.words || !data.display_order) {
        throw new Error(data.error || "删除失败");
      }

      const deletedSet = new Set(ids);
      setWords(data.words);
      setDisplayOrder(data.display_order);
      persistVocabCache(data.words, refs, data.display_order);
      setSelectedDeleteIds(new Set());
      setSharedTodayWordIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setSessionLevel((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      setSessionReviewAt((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      if (highlightId != null && deletedSet.has(highlightId)) {
        setHighlightId(null);
      }
      setStatus(`已删除 ${data.deleted ?? ids.length} 条词条。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingBatch(false);
    }
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

  if (
    user &&
    ((isAdminMode && !canAccessEnVocabAdminPage) ||
      (isTeacherMode && !canAccessEnVocabTeacherPage))
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
            管理全库词条、导出与删除。老师端负责抽查勾选与共享到学生端。
          </>
        ) : (
          <>扫一眼单词或语法表，学生回答后勾选熟悉程度。</>
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
              {isAdminMode ? (
                <>
                  共 {words.length} 条
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
                </>
              ) : canOperate ? (
                <>本轮未勾选 {unmarkedCount}</>
              ) : null}
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
            {isAdminMode ? (
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
                  openEnAuth();
                  return;
                }
                setShowManualAdd(true);
              }}
              disabled={loading}
              title={canOperate ? undefined : "登录后可添加"}
            >
              手动添加
            </button>
            {isAdminMode ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--danger"
                onClick={() => void batchDeleteSelected()}
                disabled={
                  loading || deletingBatch || !selectedDeleteIds.size || !canOperate
                }
                title={
                  selectedDeleteIds.size
                    ? `删除已选 ${selectedDeleteIds.size} 条`
                    : "先在表格中勾选要删除的词条"
                }
              >
                {deletingBatch
                  ? "删除中…"
                  : selectedDeleteIds.size
                    ? `批量删除 (${selectedDeleteIds.size})`
                    : "批量删除"}
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
                <strong>{enVocabPriorityLabel(locale)}</strong>
                ：根据「复习次数统计」估算每个单词/语法下节课该先抽查谁，数值越高越建议优先提问。
                计算公式：一般 × 1 + 不熟悉 × 2 − 非常熟悉 × 0.3（保留 1 位小数）。
                ≥ 3 建议重点抽查，≥ 1 建议留意，&lt; 1 掌握较好；
                为 0 或更低表示尚未复习，或多次勾选「非常熟悉」。
                「今日抽查次数」：每勾选一次熟悉程度 +1，北京时间 0 点自动归零；15 秒内对同一单词改选（如非常熟悉改一般）视为修正，不重复计次，只按最后一次更新统计。
                单词表默认按抽查优先级排序，每天北京时间 0 点重排一次；当天内勾选或刷新页面不会改变顺序（所有老师看到相同顺序）。管理员可使用「重置 → 今日重置」立即重排并清空当前轮次勾选，统计次数不变。
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
            暂无条目。复习词表由「英语新课」自动导入，也可登录后点「手动添加」补充。
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
                  onChange={(e) => setKindFilter(e.target.value as EnVocabKindFilter)}
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
                    匹配 {filteredDisplayedWords.length} / {displayedWords.length} 条
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
                  {isAdminMode ? (
                    <th rowSpan={2} className="jp-vocab-select-col" title="勾选后可批量删除">
                      <input
                        type="checkbox"
                        className="jp-vocab-select-checkbox"
                        checked={allPageDeleteSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = somePageDeleteSelected;
                        }}
                        aria-label="全选本页"
                        disabled={loading || deletingBatch || !pagedDeleteIds.length}
                        onChange={toggleSelectAllPageForDelete}
                      />
                    </th>
                  ) : null}
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
                    音标 / 读音
                  </th>
                  <th rowSpan={2} className="jp-vocab-meaning-col">
                    释义
                  </th>
                  <th rowSpan={2} className="jp-vocab-pos-col">
                    词性
                  </th>
                  <th rowSpan={2} className="jp-vocab-example-col">
                    例句
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
                      title={`按${enVocabPriorityLabel(locale)}排序（一般×1 + 不熟悉×2 − 非常熟悉×0.3）`}
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
                  const sharedLocked = sharedTodayWordIds.has(w.id);
                  const selected =
                    sessionLevel[w.id] ?? (sharedLocked ? ("weak" as EnVocabLevel) : undefined);
                  const isSaving = savingId === w.id;
                  const ref = w.ref_key ? refs[w.ref_key] : undefined;
                  const risk = enVocabRiskIndex(w);
                  const todayChecks = effectiveTodayCheckCount(
                    w.today_check_count ?? 0,
                    w.today_check_date
                  );
                  const checkedInRound = enVocabCheckedInRound(displayOrder, w);
                  const dailySeq = dailySeqByWordId.get(w.id) ?? rowIndex + 1;
                  const readingTrim = (w.reading || "").trim();
                  const meaningTrim = (w.meaning || "").trim();
                  const posTrim = (w.pos || "").trim();
                  const riskBadgeTier =
                    risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";

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
                      {isAdminMode ? (
                        <td className="jp-vocab-select-col" data-label="选择">
                          <input
                            type="checkbox"
                            className="jp-vocab-select-checkbox"
                            checked={selectedDeleteIds.has(w.id)}
                            aria-label={`选择 ${w.word}`}
                            disabled={deletingBatch}
                            onChange={(e) => toggleDeleteSelection(w.id, e.target.checked)}
                          />
                        </td>
                      ) : null}
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
                      </td>
                      <td
                        className={`jp-vocab-reading-col${
                          !readingTrim && w.kind !== "word" ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="音标 / 读音"
                      >
                        <div className="en-vocab-reading-cell">
                          <div className="en-vocab-reading-main">
                            {w.kind === "word" ? (
                              <EnVocabSpeakButton text={w.word} />
                            ) : null}
                            {readingTrim ? (
                              <span
                                className="en-vocab-reading-text"
                                title={readingTrim}
                              >
                                {readingTrim}
                              </span>
                            ) : w.kind === "word" ? (
                              <span className="en-vocab-reading-text en-vocab-reading-text--pending">
                                待补全
                              </span>
                            ) : null}
                          </div>
                          {w.reading_source?.trim() ? (
                            <JpVocabSourceLabel source={w.reading_source} />
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
                        {meaningTrim}
                        {w.meaning_source?.trim() ? (
                          <JpVocabSourceLabel source={w.meaning_source} />
                        ) : null}
                      </td>
                      <td
                        className={`jp-vocab-pos-col${!posTrim ? " jp-vocab-field-empty" : ""}`}
                        data-label="词性"
                        style={{ color: "var(--muted)" }}
                      >
                        {posTrim}
                      </td>
                      <td
                        className="jp-vocab-example-col"
                        data-label="例句"
                        style={{ color: "var(--muted)" }}
                      >
                        <EnVocabExampleSentencesCell
                          text={w.example_sentences}
                          source={w.example_sentences_source}
                          wordLabel={w.word}
                        />
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
                                  !canOperate || sharedLocked
                                    ? " jp-vocab-level-opt--readonly"
                                    : ""
                                }${lv.key === "very" ? " jp-vocab-level-opt--very" : ""}${
                                  lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                                }`}
                                disabled={!canOperate || isSaving || sharedLocked}
                                title={
                                  sharedLocked
                                    ? "今日已共享，熟悉程度不可更改"
                                    : !canOperate
                                      ? "登录后可勾选"
                                      : isSaving
                                        ? "保存中…"
                                        : undefined
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
                          const totalDisplay = formatEnVocabTotalReviewsDisplay(w, locale);
                          if (totalDisplay.isZero) {
                            return (
                              <span
                                className="jp-vocab-total-never"
                                title={enVocabTotalReviewsZeroHint(locale)}
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
                            !(w.class_notes || "").trim() && !canOperate
                              ? " jp-vocab-field-empty"
                              : ""
                          }`}
                          data-label="备注"
                        >
                          <div className="jp-vocab-notes-actions">
                            {(w.class_notes || "").trim() ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact"
                                onClick={() => setViewingRemarksWord(w)}
                              >
                                查看
                              </button>
                            ) : null}
                            {canOperate ? (
                              <EnEditIconButton
                                title="编辑备注"
                                onClick={() => setEditingRemarksWord(w)}
                              />
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                      <td
                        className={`jp-vocab-action-col${!canOperate ? " jp-vocab-field-empty" : ""}`}
                        data-label="操作"
                      >
                        {canOperate ? (
                          <div className="jp-vocab-action-buttons">
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact"
                              onClick={() => setEditingWord(w)}
                            >
                              编辑
                            </button>
                            {teacherShareUiEnabled ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-share-btn"
                                disabled={
                                  sharingId === w.id ||
                                  isSaving ||
                                  sharedTodayWordIds.has(w.id)
                                }
                                title={
                                  sharedTodayWordIds.has(w.id)
                                    ? "今日已共享"
                                    : sharingId === w.id
                                      ? "共享中…"
                                      : "共享到学生「今日背英语单词」，并标记为不熟悉"
                                }
                                onClick={() => void shareWord(w.id)}
                              >
                                {sharedTodayWordIds.has(w.id)
                                  ? "已共享"
                                  : sharingId === w.id
                                    ? "共享中…"
                                    : "共享"}
                              </button>
                            ) : null}
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

      <EnVocabResetChoiceModal
        open={showResetChoice}
        busy={resetting}
        onClose={() => setShowResetChoice(false)}
        onResetToday={resetToday}
        onResetAll={resetAll}
      />

      <EnVocabManualAddModal
        open={showManualAdd}
        locale={locale}
        onClose={() => setShowManualAdd(false)}
        onAdded={handleWordAdded}
      />

      <EnVocabRiskChartModal
        open={showRiskChart}
        words={words}
        onClose={() => setShowRiskChart(false)}
      />

      <EnVocabDailyQuizIntroModal
        open={showDailyIntro}
        onClose={() => setShowDailyIntro(false)}
      />

      <EnVocabRemarksViewModal
        open={viewingRemarksWord != null}
        word={viewingRemarksWord}
        onClose={() => setViewingRemarksWord(null)}
      />

      <EnVocabRefPreviewModal
        open={previewRef != null}
        refMeta={previewRef?.ref ?? null}
        cacheVersion={previewRef?.cacheVersion}
        onClose={() => setPreviewRef(null)}
      />

      <EnClassNotesEditModal
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
        onNeedAuth={openEnAuth}
      />

      <EnVocabEditModal
        open={editingWord != null}
        word={editingWord}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingWord(null)}
        onSaved={handleWordSaved}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openEnAuth}
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
        /* 对齐日语：fixed 压缩进视口；操作列 sticky，禁止被例句/统计挤出屏幕 */
        :global(.jp-vocab-table) {
          width: 100%;
          table-layout: fixed;
          min-width: 0;
        }
        :global(.jp-vocab-table th),
        :global(.jp-vocab-table td) {
          white-space: normal;
          vertical-align: middle;
          padding: 0.4rem 0.35rem;
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
        :global(.jp-vocab-table .jp-vocab-select-col) {
          width: 2.5%;
          min-width: 0;
          text-align: center;
          padding-left: 0.35rem;
          padding-right: 0.35rem;
        }
        :global(.jp-vocab-select-checkbox) {
          width: 1rem;
          height: 1rem;
          margin: 0;
          cursor: pointer;
          accent-color: var(--accent);
        }
        :global(.jp-vocab-select-checkbox:disabled) {
          cursor: not-allowed;
          opacity: 0.55;
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
          width: 11%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-stats-group) {
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-stat-detail) {
          width: 3.5%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-stat-total) {
          width: 3%;
          min-width: 0;
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
          width: 4%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-risk-value) {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-vocab-table .jp-vocab-stat-detail) {
          width: 3.5%;
          min-width: 0;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-vocab-table .jp-vocab-stat-total) {
          white-space: nowrap;
          width: 3%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-total-never) {
          color: var(--muted);
          font-size: 0.8125rem;
          letter-spacing: 0.02em;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-col) {
          white-space: nowrap;
          width: 4.5%;
          min-width: 0;
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
          font-size: 0.875rem;
          width: 8%;
          min-width: 0;
          padding-left: 0.4rem;
          padding-right: 0.4rem;
        }
        :global(.jp-vocab-table .jp-vocab-reading-col) {
          width: 7%;
          min-width: 0;
          padding-left: 0.4rem;
          padding-right: 0.4rem;
          line-height: 1.45;
        }
        /* 竖排：喇叭+音标一行，来源角标在下一行；禁止与来源横挤导致 IPA 被拆断 */
        .en-vocab-reading-cell {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.15rem;
          width: 100%;
          max-width: 100%;
          color: var(--muted);
        }
        .en-vocab-reading-main {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          max-width: 100%;
        }
        .en-vocab-reading-text {
          flex: 0 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .en-vocab-reading-text--pending {
          font-size: 0.8125rem;
          opacity: 0.72;
          white-space: nowrap;
        }
        :global(.en-vocab-speak-btn) {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.75rem;
          height: 1.75rem;
          margin: 0;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--panel);
          color: var(--accent);
          cursor: pointer;
        }
        :global(.en-vocab-speak-btn:hover:not(:disabled)) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        :global(.en-vocab-speak-btn:disabled) {
          opacity: 0.55;
          cursor: not-allowed;
        }
        :global(.en-vocab-speak-btn.is-playing) {
          color: var(--rise);
          border-color: color-mix(in srgb, var(--rise) 45%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
        }
        :global(.jp-vocab-table .jp-vocab-meaning-col) {
          width: 8%;
          min-width: 0;
          padding-left: 0.4rem;
          padding-right: 0.4rem;
          word-break: break-word;
          line-height: 1.45;
        }
        :global(.jp-vocab-table .jp-vocab-pos-col) {
          width: 5%;
          min-width: 0;
        }
        /* 例句列仅「查看」按钮，内容在弹窗；列保持窄 */
        :global(.jp-vocab-table .jp-vocab-example-col) {
          width: 5%;
          min-width: 0;
          max-width: none;
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
        }
        :global(.jp-vocab-table .jp-vocab-risk-col) {
          white-space: nowrap;
          width: 4%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-col) {
          white-space: nowrap;
          width: 4.5%;
          min-width: 0;
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-notes-col) {
          width: 5%;
          min-width: 0;
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
        /* 与日语词表一致：操作列钉在右侧，横滑时编辑/删除仍可见 */
        :global(.jp-vocab-table .jp-vocab-action-col) {
          position: sticky;
          right: 0;
          z-index: 2;
          width: 10%;
          min-width: 0;
          white-space: normal;
          background: transparent;
          box-shadow: none;
        }
        :global(.jp-vocab-table thead .jp-vocab-action-col) {
          z-index: 3;
        }
        .jp-vocab-action-buttons {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }
        .jp-vocab-action-buttons :global(.btn-rsi-filter--compact) {
          min-width: 0;
          padding-inline: 0.35rem;
          font-size: 0.6875rem;
        }
        .jp-vocab-share-btn:not(:disabled) {
          color: var(--accent);
        }
        :global(.jp-vocab-table .jp-vocab-kind-col) {
          white-space: nowrap;
          width: 4%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-seq-col) {
          white-space: nowrap;
          width: 3.5%;
          min-width: 0;
          color: var(--muted);
        }
        :global(.jp-vocab-table .jp-vocab-select-col) {
          width: 2.5%;
          min-width: 0;
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

        /* 手机 / 小屏：紧凑信息列表卡片 */
        @media (max-width: 768px) {
          .jp-vocab-scroll-hint {
            display: none;
          }
          :global(.jp-vocab-page) {
            padding-top: 1rem !important;
          }
          :global(.jp-vocab-table) {
            min-width: 0;
          }
          :global(.jp-vocab-table thead) {
            display: none;
          }
          :global(.jp-vocab-table tbody tr) {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 12px;
            padding: 14px;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: color-mix(in srgb, var(--panel) 92%, var(--bg));
          }
          :global(.jp-vocab-table tbody td) {
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            justify-content: flex-start;
            gap: 8px;
            padding: 0;
            border: none;
            text-align: left;
            line-height: 1.35;
          }
          :global(.jp-vocab-table tbody td::before) {
            content: attr(data-label) "：";
            flex: 0 0 5.5rem;
            min-width: 5rem;
            max-width: 6.25rem;
            font-size: 0.875rem;
            font-weight: 400;
            color: var(--muted);
            text-align: left;
            padding-right: 0;
          }
          :global(.jp-vocab-table tbody td.jp-vocab-field-empty) {
            display: none;
          }
          :global(.jp-vocab-table .jp-vocab-word-col) {
            order: -1;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            padding: 0 0 8px;
            margin-bottom: 2px;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-word-col::before) {
            display: none;
          }
          .jp-vocab-word-cell {
            text-align: center;
            width: 100%;
            align-items: center;
          }
          .jp-vocab-word-link,
          .jp-vocab-word-text {
            font-size: clamp(1.75rem, 8vw, 2rem);
            font-weight: 600;
            line-height: 1.2;
          }
          :global(.jp-vocab-table .jp-vocab-seq-col) {
            order: 1;
          }
          :global(.jp-vocab-table .jp-vocab-kind-col) {
            order: 2;
          }
          :global(.jp-vocab-table .jp-vocab-reading-col) {
            order: 3;
            max-width: none;
          }
          :global(.jp-vocab-table .jp-vocab-meaning-col) {
            order: 4;
            max-width: none;
          }
          :global(.jp-vocab-table .jp-vocab-pos-col) {
            order: 5;
          }
          :global(.jp-vocab-table .jp-vocab-example-col) {
            order: 6;
            width: auto;
            min-width: 0;
            max-width: none;
            white-space: normal;
            text-align: left;
          }
          :global(.jp-vocab-table .jp-vocab-risk-col) {
            order: 7;
          }
          :global(.jp-vocab-table .jp-vocab-level-col) {
            order: 8;
            flex-direction: column;
            align-items: stretch;
            gap: 6px;
            padding-top: 4px;
            margin-top: 2px;
            border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-level-col::before) {
            flex: 0 0 auto;
            width: auto;
            max-width: none;
          }
          :global(.jp-vocab-table tbody td > *) {
            flex: 1;
            min-width: 0;
            font-size: 0.9375rem;
          }
          :global(.jp-vocab-table .jp-vocab-seq-cell) {
            flex-direction: row;
            align-items: center;
            gap: 0.35rem;
            min-height: 0;
          }
          :global(.jp-vocab-table .jp-vocab-kind-badge) {
            font-size: 0.9375rem;
            padding: 0;
            border: none;
            border-radius: 0;
            background: none;
            color: var(--text);
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge) {
            display: inline-flex;
            align-items: center;
            flex: 0 0 auto;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 0.875rem;
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
            justify-content: flex-start;
            width: 100%;
            gap: 12px;
          }
          .jp-vocab-level-opt {
            min-height: 2.25rem;
            padding: 4px 8px;
            flex: 0 1 auto;
            justify-content: flex-start;
            font-size: 0.875rem;
          }
          :global(.jp-vocab-table .jp-vocab-stat-detail),
          :global(.jp-vocab-table .jp-vocab-stat-total),
          :global(.jp-vocab-table .jp-vocab-today-check-col) {
            display: none;
          }
          :global(.jp-vocab-table .jp-vocab-notes-col),
          :global(.jp-vocab-table .jp-vocab-action-col) {
            order: 9;
            padding-top: 4px;
            border-top: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-action-col) {
            position: static;
            order: 10;
            border-top: none;
            padding-top: 0;
            width: auto;
          }
          :global(.jp-vocab-table .jp-vocab-notes-col.jp-vocab-field-empty) {
            display: none;
          }
          .jp-vocab-ref-hint {
            display: block;
            width: 100%;
            margin-left: 0;
            margin-top: 0.15rem;
            text-align: center;
            font-size: 0.75rem;
          }
        }

        @media (max-width: 480px) {
          :global(.jp-vocab-table tbody tr) {
            padding: 12px;
          }
        }
      `}</style>
    </main>
  );
}
