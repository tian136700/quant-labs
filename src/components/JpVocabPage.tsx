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
  isJpVocabDefaultStatSort,
  isJpVocabRoundChecked,
  markJpVocabRoundChecked,
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
} from "@/lib/jp-vocab-daily-check";
import { applyJpVocabReview } from "@/lib/jp-vocab-review";
import { jpVocabRefViewerPath } from "@/lib/jp-vocab-ref-shared";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

function readVocabCache(): JpVocabApiPayload | null {
  return readClientCache<JpVocabApiPayload>(JP_VOCAB_CACHE_KEY);
}

function persistVocabCache(
  words: JpVocabWord[],
  refs: Record<string, JpVocabRef>,
  display_order: JpVocabDailyDisplayOrder
) {
  const prev = readVocabCache();
  writeClientCache(JP_VOCAB_CACHE_KEY, {
    words,
    refs,
    daily_quiz_style: prev?.daily_quiz_style ?? JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
    display_order,
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

/** 按当前排序，每日建议优先抽查的前 N 条 */
const JP_VOCAB_DAILY_QUIZ_TOP = 20;

function jpVocabCheckedInRound(
  order: JpVocabDailyDisplayOrder,
  word: JpVocabWord
): boolean {
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
  const { user, checking, canAccessJpVocab, refresh, openAuthPanel, isAdmin } =
    useEtrAuth();
  const canOperate = canAccessJpVocab;

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
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  /** 本轮复习：每词当前勾选（仅前端，重置后清空） */
  const [sessionLevel, setSessionLevel] = useState<
    Record<number, JpVocabLevel | undefined>
  >({});
  /** 本轮每词最近一次勾选时间（毫秒，用于 15 秒内改选修正） */
  const [sessionReviewAt, setSessionReviewAt] = useState<Record<number, number>>({});
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [editingWord, setEditingWord] = useState<JpVocabWord | null>(null);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<JpVocabWord | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<JpVocabWord | null>(null);
  const [statSort, setStatSort] = useState<{
    key: JpVocabStatSortKey;
    dir: "asc" | "desc";
  }>(() => JP_VOCAB_DEFAULT_STAT_SORT);
  /** 服务端持久化的当日行顺序（北京时间 0 点重排，当天内刷新/勾选不变） */
  const [displayOrder, setDisplayOrder] = useState<JpVocabDailyDisplayOrder>({
    date: "",
    ids: [],
    round_checked_ids: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<JpVocabKindFilter>("all");
  const [exporting, setExporting] = useState(false);
  const [showRiskChart, setShowRiskChart] = useState(false);
  const [showDailyIntro, setShowDailyIntro] = useState(false);
  const [showVocabHelp, setShowVocabHelp] = useState(false);
  const displayOrderRef = useRef(displayOrder);
  const wordsRef = useRef(words);
  const refsRef = useRef(refs);
  const editingRemarksIdRef = useRef<number | null>(null);
  const editingWordIdRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);

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

  const toggleStatSort = (key: JpVocabStatSortKey) => {
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
    if (isJpVocabDefaultStatSort(statSort) && displayOrder.ids.length > 0) {
      return jpVocabWordsInOrder(words, displayOrder.ids);
    }
    return sortJpVocabWordsForDisplay(words, statSort);
  }, [words, statSort, displayOrder.ids]);

  const filteredDisplayedWords = useMemo(
    () => filterJpVocabWordsBySearch(displayedWords, searchQuery, kindFilter),
    [displayedWords, searchQuery, kindFilter]
  );

  const searchActive = searchQuery.trim().length > 0;
  const filterActive = searchActive || kindFilter !== "all";

  const dailyTarget = Math.min(JP_VOCAB_DAILY_QUIZ_TOP, words.length);

  const dailyCheckedCount = useMemo(() => {
    if (!displayedWords.length) return 0;
    return displayedWords
      .slice(0, dailyTarget)
      .filter((w) => jpVocabCheckedInRound(displayOrder, w)).length;
  }, [displayedWords, dailyTarget, displayOrder]);

  const anyCheckedInRound = useMemo(
    () => (displayOrder.round_checked_ids ?? []).length > 0,
    [displayOrder.round_checked_ids]
  );

  useEffect(() => {
    if (loading || checking || !canOperate || !words.length) return;
    if (anyCheckedInRound) return;
    if (!shouldShowJpVocabDailyIntro()) return;
    setShowDailyIntro(true);
  }, [loading, checking, canOperate, words.length, anyCheckedInRound]);

  const unmarkedCount = useMemo(
    () => words.filter((w) => !sessionLevel[w.id]).length,
    [words, sessionLevel]
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
    const prevLevel = sessionLevel[wordId];
    const prevReviewAt = sessionReviewAt[wordId];
    const displayOrderSnapshot = displayOrderRef.current;
    const nowMs = Date.now();

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
          throw new Error(data.error || (locale === "zh" ? "保存失败" : "Save failed"));
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
      setStatSort(JP_VOCAB_DEFAULT_STAT_SORT);
      setHighlightId(null);
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
    const next = pickRandomWord(words, highlightId ?? undefined);
    if (next) {
      setHighlightId(next.id);
      document
        .getElementById(`jp-vocab-row-${next.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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

  return (
    <main className="page-wrap jp-vocab-page" style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>日语单词 / 语法抽问</h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        扫一眼单词或语法表，学生回答后勾选熟悉程度。
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
          <div className="etr-table-wrap jp-vocab-table-wrap">
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
                      <span className="jp-vocab-th-multiline__sub">老师勾选</span>
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
                {filteredDisplayedWords.map((w, rowIndex) => {
                  const isHighlight = highlightId === w.id;
                  const selected = sessionLevel[w.id];
                  const isSaving = savingId === w.id;
                  const ref = w.ref_key ? refs[w.ref_key] : undefined;
                  const risk = jpVocabRiskIndex(w);
                  const todayChecks = effectiveTodayCheckCount(
                    w.today_check_count ?? 0,
                    w.today_check_date
                  );
                  const checkedInRound = jpVocabCheckedInRound(displayOrder, w);

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
                          <span className="jp-vocab-seq-num">{rowIndex + 1}</span>
                          {checkedInRound ? (
                            <span
                              className="jp-vocab-seq-checked"
                              title="当前轮次已抽查"
                              aria-label={`序号 ${rowIndex + 1}，当前轮次已抽查`}
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
                              <a
                                href={jpVocabRefViewerPath(w.ref_key, ref?.updated_at)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="jp-vocab-word-link"
                                title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                              >
                                {w.word}
                              </a>
                              <span className="jp-vocab-ref-hint">（点击可进入教案）</span>
                            </>
                          ) : (
                            <span className="jp-vocab-word-text">{w.word}</span>
                          )}
                        </div>
                      </td>
                      <td className="jp-vocab-reading-col" data-label="读音" style={{ color: "var(--muted)" }}>
                        {w.reading || ""}
                      </td>
                      <td className="jp-vocab-meaning-col" data-label="释义" style={{ color: "var(--muted)" }}>
                        {w.meaning || ""}
                      </td>
                      <td className="jp-vocab-pos-col" data-label="词性" style={{ color: "var(--muted)" }}>
                        {w.pos || ""}
                      </td>
                      <td className="jp-vocab-risk-col" data-label={jpVocabPriorityLabel(locale)}>
                        <span className="jp-vocab-risk-value">{risk.toFixed(1)}</span>
                      </td>
                      <td className="jp-vocab-level-col" data-label="熟悉程度（老师勾选）">
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
                                }${!canOperate ? " jp-vocab-level-opt--readonly" : ""}${
                                  lv.key === "very" ? " jp-vocab-level-opt--very" : ""
                                }${
                                  lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                                }`}
                                disabled={!canOperate || isSaving}
                                title={
                                  !canOperate
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
                        <td className="jp-vocab-notes-col" data-label="备注">
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
                              <JpEditIconButton
                                title="编辑备注"
                                onClick={() => setEditingRemarksWord(w)}
                              />
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                      <td className="jp-vocab-action-col" data-label="操作">
                        {canOperate ? (
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--compact"
                            onClick={() => setEditingWord(w)}
                          >
                            编辑
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
        words={words}
        onClose={() => setShowRiskChart(false)}
      />

      <JpVocabDailyQuizIntroModal
        open={showDailyIntro}
        dailyTarget={dailyTarget}
        dailyCheckedCount={dailyCheckedCount}
        onClose={() => setShowDailyIntro(false)}
      />

      <JpVocabRemarksViewModal
        open={viewingRemarksWord != null}
        word={viewingRemarksWord}
        onClose={() => setViewingRemarksWord(null)}
      />

      <JpClassNotesEditModal
        open={editingRemarksWord != null}
        word={editingRemarksWord}
        locale={locale}
        canEdit={canOperate}
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
        :global(.jp-vocab-page .jp-vocab-table-wrap) {
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
          color: var(--muted);
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
          min-width: 5rem;
          padding-left: 0.65rem;
          padding-right: 0.65rem;
          word-break: break-word;
          line-height: 1.45;
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
          min-width: 3.75rem;
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

        /* 手机 / 小屏：卡片布局，无需横向滚表格 */
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
            display: block;
            margin-bottom: 0.85rem;
            padding: 0.75rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: color-mix(in srgb, var(--panel) 88%, var(--bg));
          }
          :global(.jp-vocab-table tbody td) {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.35rem;
            padding: 0.45rem 0;
            border: none;
            text-align: center;
          }
          :global(.jp-vocab-table tbody td::before) {
            content: attr(data-label);
            flex: 0 0 auto;
            width: 100%;
            max-width: none;
            font-size: 0.8125rem;
            color: var(--muted);
            text-align: center;
            padding-right: 0;
          }
          :global(.jp-vocab-table .jp-vocab-kind-col::before),
          :global(.jp-vocab-table .jp-vocab-word-col::before) {
            padding-top: 0;
          }
          :global(.jp-vocab-table .jp-vocab-word-col) {
            flex-wrap: nowrap;
          }
          .jp-vocab-word-cell {
            text-align: center;
            width: 100%;
          }
          :global(.jp-vocab-table .jp-vocab-meaning-col) {
            max-width: none;
          }
          :global(.jp-vocab-table .jp-vocab-level-col) {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          :global(.jp-vocab-table .jp-vocab-level-col::before) {
            margin-bottom: 0;
          }
          .jp-vocab-levels {
            justify-content: center;
            width: 100%;
          }
          .jp-vocab-level-opt {
            min-height: var(--touch-min, 44px);
            padding: 0.5rem 0.65rem;
            flex: 1 1 calc(50% - 0.25rem);
            justify-content: center;
          }
          :global(.jp-vocab-table .jp-vocab-stat-detail) {
            display: flex;
          }
          :global(.jp-vocab-table .jp-vocab-today-check-col),
          :global(.jp-vocab-table .jp-vocab-stat-total) {
            align-items: center;
          }
          .jp-vocab-ref-hint {
            display: block;
            width: 100%;
            margin-left: 0;
            margin-top: 0.2rem;
            text-align: center;
          }
        }

        @media (max-width: 480px) {
          .jp-vocab-level-opt {
            flex: 1 1 100%;
          }
          :global(.jp-vocab-table tbody tr) {
            padding: 0.65rem;
          }
        }
      `}</style>
    </main>
  );
}
