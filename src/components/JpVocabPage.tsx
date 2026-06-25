"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  jpVocabPriorityLabel,
  jpVocabRiskIndex,
  jpVocabTotalReviews,
  formatJpVocabTotalReviewsDisplay,
  jpVocabTotalReviewsZeroHint,
  sortJpVocabWordsForDisplay,
  type JpVocabStatSortKey,
} from "@/lib/jp-vocab-shared";
import { JpVocabEditModal } from "@/components/JpVocabEditModal";
import { JpVocabRemarksViewModal } from "@/components/JpVocabRemarksViewModal";
import { JpVocabManualAddModal } from "@/components/JpVocabManualAddModal";
import { JpVocabRiskChartModal } from "@/components/JpVocabRiskChartModal";
import {
  JP_VOCAB_CACHE_KEY,
  parseJpVocabApi,
  type JpVocabApiPayload,
} from "@/lib/jp-api-cache";
import { fetchWithClientCache, readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import { exportJpVocabToExcel } from "@/lib/jp-vocab-export";
import { effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import { applyJpVocabReview } from "@/lib/jp-vocab-review";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  jpVocabDailyQuizStyleVars,
  readJpVocabDailyQuizStyle,
  writeJpVocabDailyQuizStyle,
  type JpVocabDailyQuizStyle,
} from "@/lib/jp-vocab-daily-quiz-style";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

function readVocabCache(): JpVocabApiPayload | null {
  return readClientCache<JpVocabApiPayload>(JP_VOCAB_CACHE_KEY);
}

function persistVocabCache(words: JpVocabWord[], refs: Record<string, JpVocabRef>) {
  writeClientCache(JP_VOCAB_CACHE_KEY, { words, refs });
}

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

const STAT_SORT_COLUMNS: { key: JpVocabStatSortKey; label: string; className: string }[] = [
  { key: "very", label: "非常熟悉", className: "jp-vocab-stat-detail" },
  { key: "normal", label: "一般", className: "jp-vocab-stat-detail" },
  { key: "weak", label: "不熟悉", className: "jp-vocab-stat-detail" },
  { key: "total", label: "合计", className: "jp-vocab-stat-total" },
];

/** 单词表「备注」列 */
const SHOW_REMARKS_COLUMN = true;

/** 暂时隐藏「随机高亮」按钮 */
const SHOW_RANDOM_HIGHLIGHT = false;

/** 末次勾选后多久再自动重排（老师勾选过程中列表不跳动） */
const JP_VOCAB_SORT_IDLE_MS = 60 * 60 * 1000;

/** 按当前排序，每日建议优先抽查的前 N 条（淡色背景标记） */
const JP_VOCAB_DAILY_QUIZ_TOP = 20;

function jpVocabCheckedToday(word: JpVocabWord): boolean {
  return (
    effectiveTodayCheckCount(word.today_check_count ?? 0, word.today_check_date) > 0
  );
}

function jpVocabSortedIds(
  words: JpVocabWord[],
  statSort: { key: JpVocabStatSortKey; dir: "asc" | "desc" }
): number[] {
  return sortJpVocabWordsForDisplay(words, statSort).map((w) => w.id);
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

function needsReview(word: JpVocabWord): boolean {
  const total = jpVocabTotalReviews(word);
  if (total === 0) return true;
  return word.cnt_weak >= word.cnt_very;
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
  const [statSort, setStatSort] = useState<{
    key: JpVocabStatSortKey;
    dir: "asc" | "desc";
  }>(() => JP_VOCAB_DEFAULT_STAT_SORT);
  /** 勾选期间冻结的行顺序（id 列表），避免抽查优先级变化导致行跳动 */
  const [frozenOrder, setFrozenOrder] = useState<number[]>([]);
  const [isOrderFrozen, setIsOrderFrozen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showRiskChart, setShowRiskChart] = useState(false);
  const [showDailyQuizStylePanel, setShowDailyQuizStylePanel] = useState(false);
  const [showVocabHelp, setShowVocabHelp] = useState(false);
  const [dailyQuizStyle, setDailyQuizStyle] = useState<JpVocabDailyQuizStyle>(
    JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT
  );

  useEffect(() => {
    setDailyQuizStyle(readJpVocabDailyQuizStyle());
  }, []);

  const patchDailyQuizStyle = useCallback(
    (patch: Partial<JpVocabDailyQuizStyle>) => {
      setDailyQuizStyle((prev) => {
        const next = { ...prev, ...patch };
        writeJpVocabDailyQuizStyle(next);
        return next;
      });
    },
    []
  );

  const dailyQuizStyleCssVars = useMemo(
    () => jpVocabDailyQuizStyleVars(dailyQuizStyle),
    [dailyQuizStyle]
  );

  const wordsRef = useRef(words);
  const statSortRef = useRef(statSort);
  const sortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOrderFrozenRef = useRef(isOrderFrozen);
  const frozenOrderRef = useRef(frozenOrder);

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);
  useEffect(() => {
    statSortRef.current = statSort;
  }, [statSort]);
  useEffect(() => {
    isOrderFrozenRef.current = isOrderFrozen;
  }, [isOrderFrozen]);
  useEffect(() => {
    frozenOrderRef.current = frozenOrder;
  }, [frozenOrder]);

  const clearDeferredSort = useCallback(() => {
    if (sortTimerRef.current != null) {
      clearTimeout(sortTimerRef.current);
      sortTimerRef.current = null;
    }
  }, []);

  const applyLiveSort = useCallback(() => {
    const nextOrder = jpVocabSortedIds(wordsRef.current, statSortRef.current);
    setFrozenOrder(nextOrder);
    setIsOrderFrozen(false);
  }, []);

  const scheduleDeferredSort = useCallback(() => {
    clearDeferredSort();
    sortTimerRef.current = setTimeout(() => {
      sortTimerRef.current = null;
      applyLiveSort();
    }, JP_VOCAB_SORT_IDLE_MS);
  }, [applyLiveSort, clearDeferredSort]);

  useEffect(() => () => clearDeferredSort(), [clearDeferredSort]);

  const freezeDisplayOrder = useCallback((order: number[]) => {
    setFrozenOrder(order);
    setIsOrderFrozen(true);
    scheduleDeferredSort();
  }, [scheduleDeferredSort]);

  const toggleStatSort = (key: JpVocabStatSortKey) => {
    clearDeferredSort();
    setIsOrderFrozen(false);
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
  }, []);

  const loadWords = useCallback(async () => {
    const cached = readVocabCache();
    const hasCache = cached != null;
    if (hasCache) {
      applyVocabPayload(cached);
      setRefreshing(true);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const payload = await fetchWithClientCache(
        JP_VOCAB_CACHE_KEY,
        "/api/jp-vocab",
        parseJpVocabApi,
        { onCached: applyVocabPayload }
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

  const displayedWords = useMemo(() => {
    if (isOrderFrozen && frozenOrder.length > 0) {
      return jpVocabWordsInOrder(words, frozenOrder);
    }
    return sortJpVocabWordsForDisplay(words, statSort);
  }, [words, statSort, isOrderFrozen, frozenOrder]);

  const dailyQuizTopIds = useMemo(
    () => new Set(displayedWords.slice(0, JP_VOCAB_DAILY_QUIZ_TOP).map((w) => w.id)),
    [displayedWords]
  );

  const dailyQuizPendingCount = useMemo(
    () =>
      displayedWords
        .slice(0, JP_VOCAB_DAILY_QUIZ_TOP)
        .filter((w) => !jpVocabCheckedToday(w)).length,
    [displayedWords]
  );

  const reviewCandidates = useMemo(
    () => words.filter((w) => needsReview(w)),
    [words]
  );

  const unmarkedCount = useMemo(
    () => words.filter((w) => !sessionLevel[w.id]).length,
    [words, sessionLevel]
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
    const nowMs = Date.now();

    if (!isOrderFrozenRef.current) {
      const currentOrder =
        frozenOrderRef.current.length > 0
          ? frozenOrderRef.current
          : jpVocabSortedIds(wordsRef.current, statSortRef.current);
      freezeDisplayOrder(currentOrder);
    } else {
      scheduleDeferredSort();
    }

    setSessionLevel((prev) => ({ ...prev, [wordId]: level }));
    setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
    setHighlightId(wordId);
    setStatus("");
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId ? bumpWordReview(w, level, prevLevel) : w
      )
    );
    setSavingId(wordId);

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
        persistVocabCache(next, refs);
        return next;
      });
    } catch (err) {
      if (snapshot) {
        setWords((prev) =>
          prev.map((w) => (w.id === wordId ? snapshot : w))
        );
      }
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

  const resetAll = async () => {
    if (!canOperate) {
      setStatus("请登录后再重置。");
      openJpAuth();
      return;
    }
    if (resetting) return;
    const ok = window.confirm(
      "确定全部重置？将清空所有单词的熟悉程度勾选与统计次数，开始新一轮复习。"
    );
    if (!ok) return;

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
        body: JSON.stringify({ action: "reset" }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        words?: JpVocabWord[];
        error?: string;
      };
      if (!data.ok || !data.words) {
        throw new Error(data.error || "重置失败");
      }
      setWords(data.words);
      persistVocabCache(data.words, refs);
      setSessionLevel({});
      setSessionReviewAt({});
      clearDeferredSort();
      setIsOrderFrozen(false);
      setStatSort(JP_VOCAB_DEFAULT_STAT_SORT);
      setFrozenOrder(jpVocabSortedIds(data.words, JP_VOCAB_DEFAULT_STAT_SORT));
      setHighlightId(null);
      setStatus("已全部重置，可以开始新一轮复习。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
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
    setWords(nextWords);
    setRefs(nextRefs);
    persistVocabCache(nextWords, nextRefs);
    setStatus(
      `已添加：${added.word}${refDeduped ? "（共用教案链接）" : ""}`
    );
  };

  const handleWordSaved = (word: JpVocabWord) => {
    const nextWords = words.map((w) => (w.id === word.id ? word : w));
    setWords(nextWords);
    persistVocabCache(nextWords, refs);
    setStatus("词条已保存。");
  };

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
              共 {words.length} 条 · 需复习 {reviewCandidates.length} 条
              {words.length ? (
                <> · 今日待抽查 {dailyQuizPendingCount}/{Math.min(JP_VOCAB_DAILY_QUIZ_TOP, words.length)}</>
              ) : null}
              {canOperate ? <> · 本轮未勾选 {unmarkedCount}</> : null}
              {refreshing ? <> · 同步中…</> : null}
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
            {isAdmin ? (
              <button
                type="button"
                className="btn-rsi-filter"
                onClick={() => setShowDailyQuizStylePanel((v) => !v)}
                disabled={loading || !words.length}
                title="调节「当前排序前 20 条」标记背景的颜色与深浅"
                aria-expanded={showDailyQuizStylePanel}
              >
                {showDailyQuizStylePanel ? "收起标记样式" : "标记样式"}
              </button>
            ) : null}
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
                onClick={() => void resetAll()}
                disabled={loading || resetting || !words.length || !canOperate}
                title={canOperate ? undefined : "登录后可重置"}
              >
                {resetting ? "重置中…" : "全部重置"}
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
                <strong>今日待抽查前 {JP_VOCAB_DAILY_QUIZ_TOP} 条</strong>：按<strong>当前表格排序</strong>（默认抽查优先级）取最前面的 {JP_VOCAB_DAILY_QUIZ_TOP} 条，今日尚未勾选的会显示标记背景；勾选后背景消失。
                样式可在上方「标记样式」里自行调节，设置保存在本浏览器。
              </p>
            ) : null}
          </div>
        ) : null}

        {isAdmin && showDailyQuizStylePanel && !loading && words.length ? (
          <div className="jp-vocab-daily-quiz-style-panel" role="region" aria-label="今日前20条标记样式">
            <div className="jp-vocab-daily-quiz-style-panel__head">
              <strong>今日前 {JP_VOCAB_DAILY_QUIZ_TOP} 条 · 标记样式</strong>
              <span className="jp-vocab-daily-quiz-style-panel__note">
                标记范围 = 当前排序下的前 {JP_VOCAB_DAILY_QUIZ_TOP} 条（与表头排序一致，勾选过程中顺序不跳）
              </span>
            </div>
            <label className="jp-vocab-daily-quiz-style-toggle">
              <input
                type="checkbox"
                checked={dailyQuizStyle.enabled}
                onChange={(e) => patchDailyQuizStyle({ enabled: e.target.checked })}
              />
              <span>启用标记背景</span>
            </label>
            <div className="jp-vocab-daily-quiz-style-row">
              <label className="jp-vocab-daily-quiz-style-color">
                <span>背景颜色</span>
                <input
                  type="color"
                  value={dailyQuizStyle.bgColor}
                  onChange={(e) => patchDailyQuizStyle({ bgColor: e.target.value })}
                  title="选择标记背景颜色"
                />
              </label>
              <label className="jp-vocab-daily-quiz-style-opacity">
                <span>深浅 {dailyQuizStyle.bgOpacity}%</span>
                <input
                  type="range"
                  min={0}
                  max={80}
                  value={dailyQuizStyle.bgOpacity}
                  onChange={(e) =>
                    patchDailyQuizStyle({ bgOpacity: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="jp-vocab-daily-quiz-style-actions">
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact"
                onClick={() => {
                  writeJpVocabDailyQuizStyle(JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT);
                  setDailyQuizStyle(JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT);
                }}
              >
                恢复默认
              </button>
              <div
                className="jp-vocab-daily-quiz-style-preview jp-vocab-daily-quiz-wrap"
                style={dailyQuizStyleCssVars as CSSProperties}
                aria-hidden="true"
              >
                <div className="jp-vocab-daily-quiz-style-preview__row">预览：待抽查词条行</div>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: "var(--muted)" }}>加载中…</p>
        ) : !words.length ? (
          <p style={{ color: "var(--muted)" }}>
            暂无条目。复习词表由「日语新课」自动导入，也可登录后点「手动添加」补充。
          </p>
        ) : (
          <div
            className="etr-table-wrap jp-vocab-table-wrap jp-vocab-daily-quiz-wrap"
            style={dailyQuizStyleCssVars as CSSProperties}
          >
            <p className="jp-vocab-scroll-hint" aria-hidden="true">
              表格较宽时可左右滑动查看
            </p>
            <table className="compare-table etr-table jp-vocab-table">
              <thead>
                <tr>
                  <th rowSpan={2}>类型</th>
                  <th rowSpan={2}>单词 / 语法</th>
                  <th rowSpan={2}>释义</th>
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
                      <span>{jpVocabPriorityLabel(locale)}</span>
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
                    熟悉程度（老师打分）
                  </th>
                  <th colSpan={4} className="jp-vocab-stats-group">
                    复习次数统计
                  </th>
                  <th rowSpan={2} className="jp-vocab-today-check-col">
                    今日抽查次数
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
                          <span>{col.label}</span>
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
                {displayedWords.map((w) => {
                  const isHighlight = highlightId === w.id;
                  const isDailyQuiz =
                    dailyQuizStyle.enabled &&
                    dailyQuizTopIds.has(w.id) &&
                    !jpVocabCheckedToday(w);
                  const selected = sessionLevel[w.id];
                  const isSaving = savingId === w.id;
                  const ref = w.ref_key ? refs[w.ref_key] : undefined;
                  const risk = jpVocabRiskIndex(w);
                  const todayChecks = w.today_check_count ?? 0;

                  return (
                    <tr
                      key={w.id}
                      id={`jp-vocab-row-${w.id}`}
                      className={isDailyQuiz ? "jp-vocab-daily-quiz-row" : undefined}
                      style={{
                        background: isHighlight
                          ? "rgba(61, 139, 253, 0.12)"
                          : undefined,
                      }}
                    >
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
                                href={`/api/jp-vocab/ref/${encodeURIComponent(w.ref_key)}${
                                  ref?.updated_at
                                    ? `?v=${encodeURIComponent(ref.updated_at)}`
                                    : ""
                                }`}
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
                      <td className="jp-vocab-meaning-col" data-label="释义" style={{ color: "var(--muted)" }}>
                        {w.meaning || ""}
                      </td>
                      <td className="jp-vocab-pos-col" data-label="词性" style={{ color: "var(--muted)" }}>
                        {w.pos || ""}
                      </td>
                      <td className="jp-vocab-risk-col" data-label={jpVocabPriorityLabel(locale)}>
                        <span className="jp-vocab-risk-value">{risk.toFixed(1)}</span>
                      </td>
                      <td className="jp-vocab-level-col" data-label="熟悉程度（老师打分）">
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
                        <span className="jp-vocab-today-check-value">{todayChecks}</span>
                      </td>
                      {SHOW_REMARKS_COLUMN ? (
                        <td className="jp-vocab-notes-col" data-label="备注">
                          {(w.class_notes || "").trim() ? (
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact"
                              onClick={() => setViewingRemarksWord(w)}
                            >
                              查看
                            </button>
                          ) : null}
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
        )}
      </section>

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

      <JpVocabRemarksViewModal
        open={viewingRemarksWord != null}
        word={viewingRemarksWord}
        onClose={() => setViewingRemarksWord(null)}
      />

      <JpVocabEditModal
        open={editingWord != null}
        word={editingWord}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingWord(null)}
        onSaved={handleWordSaved}
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
        :global(.jp-vocab-daily-quiz-wrap) {
          --jq-bg-rgb: 255, 196, 87;
          --jq-bg-o: 0.18;
          --jq-bg-hover-o: 0.24;
        }
        :global(.jp-vocab-table tbody tr.jp-vocab-daily-quiz-row) {
          background: rgba(var(--jq-bg-rgb), var(--jq-bg-o));
        }
        :global(.jp-vocab-table tbody tr.jp-vocab-daily-quiz-row:hover) {
          background: rgba(var(--jq-bg-rgb), var(--jq-bg-hover-o));
        }
        .jp-vocab-daily-quiz-style-panel {
          margin: 0 0 0.85rem;
          padding: 0.75rem 0.9rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 94%, var(--bg));
        }
        .jp-vocab-daily-quiz-style-panel__head {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          margin-bottom: 0.65rem;
        }
        .jp-vocab-daily-quiz-style-panel__head strong {
          color: var(--text);
          font-size: 0.875rem;
        }
        .jp-vocab-daily-quiz-style-panel__note {
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.45;
        }
        .jp-vocab-daily-quiz-style-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          margin-bottom: 0.65rem;
          font-size: 0.875rem;
          cursor: pointer;
        }
        .jp-vocab-daily-quiz-style-row {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 1rem 1.25rem;
          margin-bottom: 0.75rem;
        }
        .jp-vocab-daily-quiz-style-color {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 0.875rem;
          color: var(--text);
          cursor: pointer;
        }
        .jp-vocab-daily-quiz-style-color input[type="color"] {
          width: 2.75rem;
          height: 2rem;
          padding: 0.15rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          cursor: pointer;
        }
        .jp-vocab-daily-quiz-style-opacity {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          flex: 1 1 10rem;
          min-width: 8rem;
          max-width: 16rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-daily-quiz-style-opacity input[type="range"] {
          width: 100%;
          accent-color: var(--accent);
        }
        .jp-vocab-daily-quiz-style-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
        }
        .jp-vocab-daily-quiz-style-preview {
          flex: 1 1 12rem;
          min-width: 0;
        }
        .jp-vocab-daily-quiz-style-preview__row {
          padding: 0.55rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8125rem;
          color: var(--text);
          background: rgba(var(--jq-bg-rgb), var(--jq-bg-o));
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
          min-width: 840px;
        }
        :global(.jp-vocab-table th),
        :global(.jp-vocab-table td) {
          white-space: normal;
          vertical-align: middle;
          padding: 0.55rem 0.75rem;
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-level-col) {
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-stats-group) {
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-sort-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.2rem;
          width: 100%;
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
        :global(.jp-vocab-table .jp-vocab-kind-col),
        :global(.jp-vocab-table .jp-vocab-meaning-col),
        :global(.jp-vocab-table .jp-vocab-pos-col),
        :global(.jp-vocab-table .jp-vocab-risk-col) {
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-risk-col) {
          white-space: nowrap;
          min-width: 4.5rem;
        }
        :global(.jp-vocab-table .jp-vocab-risk-value) {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-vocab-table .jp-vocab-stat-total) {
          white-space: nowrap;
          min-width: 4rem;
        }
        :global(.jp-vocab-table .jp-vocab-total-never) {
          color: var(--muted);
          font-size: 0.8125rem;
          letter-spacing: 0.02em;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-col) {
          white-space: nowrap;
          min-width: 5.5rem;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-value) {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-vocab-table .jp-vocab-word-col) {
          font-size: 0.9375rem;
          min-width: 8rem;
        }
        :global(.jp-vocab-table .jp-vocab-meaning-col) {
          min-width: 6rem;
          max-width: 16rem;
        }
        :global(.jp-vocab-table .jp-vocab-pos-col) {
          min-width: 5rem;
          max-width: 10rem;
        }
        :global(.jp-vocab-table .jp-vocab-notes-col) {
          min-width: 4.5rem;
          max-width: 5.5rem;
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
        :global(.jp-vocab-table .jp-vocab-action-col) {
          white-space: nowrap;
          min-width: 4.5rem;
        }
        :global(.jp-vocab-table .jp-vocab-kind-col) {
          white-space: nowrap;
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
          :global(.jp-vocab-table tbody tr.jp-vocab-daily-quiz-row) {
            background: rgba(var(--jq-bg-rgb), var(--jq-bg-o));
            border-color: rgba(var(--jq-bg-rgb), calc(var(--jq-bg-o) + 0.12));
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
