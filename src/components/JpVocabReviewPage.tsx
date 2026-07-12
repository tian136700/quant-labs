"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { JpVocabAdminReviewFlashcardModal } from "@/components/JpVocabAdminReviewFlashcardModal";
import { JpVocabEditModal } from "@/components/JpVocabEditModal";
import { JpClassNotesEditModal } from "@/components/JpClassNotesEditModal";
import { JpVocabRefPreviewModal } from "@/components/JpVocabRefPreviewModal";
import { JpVocabRemarksViewModal } from "@/components/JpVocabRemarksViewModal";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { MobileScrollToTopButton } from "@/components/MobileScrollToTopButton";
import {
  JP_VOCAB_CACHE_KEY,
  parseJpVocabApi,
  type JpVocabApiPayload,
} from "@/lib/jp-api-cache";
import { fetchWithClientCache } from "@/lib/client-swr-cache";
import { buildJpVocabDailySeqMap } from "@/lib/jp-vocab-daily-order";
import { resolveJpVocabRefForPreview } from "@/lib/jp-vocab-ref-shared";
import {
  JP_VOCAB_REVIEW_DEFAULT_COUNT,
  buildJpVocabReviewDailySeqMap,
  buildJpVocabReviewWordList,
  normalizeJpVocabReviewCount,
  normalizeJpVocabReviewSortMode,
  type JpVocabReviewSortMode,
} from "@/lib/jp-vocab-review-plan";
import {
  createJpVocabReviewSession,
  normalizeJpVocabReviewProgress,
  resolveJpVocabReviewResumeIndex,
  type JpVocabReviewProgress,
  type JpVocabReviewSession,
} from "@/lib/jp-vocab-review-session";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabPriorityLabel,
  jpVocabRiskIndex,
} from "@/lib/jp-vocab-shared";
import type { JpVocabRef, JpVocabWord } from "@/lib/types";

const JP_VOCAB_REVIEW_PREFS_KEY = "jp_vocab_review_prefs";

type ReviewPrefs = {
  count: number;
  sortMode: JpVocabReviewSortMode;
};

function readReviewPrefs(): ReviewPrefs {
  if (typeof window === "undefined") {
    return { count: JP_VOCAB_REVIEW_DEFAULT_COUNT, sortMode: "seq" };
  }
  try {
    const raw = localStorage.getItem(JP_VOCAB_REVIEW_PREFS_KEY);
    if (!raw) {
      return { count: JP_VOCAB_REVIEW_DEFAULT_COUNT, sortMode: "seq" };
    }
    const parsed = JSON.parse(raw) as Partial<ReviewPrefs>;
    return {
      count: normalizeJpVocabReviewCount(parsed.count, 9999),
      sortMode: normalizeJpVocabReviewSortMode(parsed.sortMode),
    };
  } catch {
    return { count: JP_VOCAB_REVIEW_DEFAULT_COUNT, sortMode: "seq" };
  }
}

function writeReviewPrefs(prefs: ReviewPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(JP_VOCAB_REVIEW_PREFS_KEY, JSON.stringify(prefs));
}

export function JpVocabReviewPage() {
  const { locale } = useI18n();
  const { user, checking, isAdmin, openAuthPanel } = useEtrAuth();

  const [words, setWords] = useState<JpVocabWord[]>([]);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>({});
  const [displayOrder, setDisplayOrder] = useState<JpVocabApiPayload["display_order"]>({
    date: "",
    ids: [],
    round_checked_ids: [],
  });
  const [reviewProgress, setReviewProgress] = useState<JpVocabReviewProgress>(
    normalizeJpVocabReviewProgress(null)
  );
  const [prefs, setPrefs] = useState<ReviewPrefs>(() => readReviewPrefs());
  const [countInput, setCountInput] = useState(String(readReviewPrefs().count));
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [session, setSession] = useState<JpVocabReviewSession | null>(null);
  const [showFlashcard, setShowFlashcard] = useState(false);
  const [recordingNext, setRecordingNext] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearProgress, setClearProgress] = useState<number | null>(null);
  const clearProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearStartedAtRef = useRef(0);

  const [previewRef, setPreviewRef] = useState<{
    ref: JpVocabRef;
    cacheVersion?: string | null;
  } | null>(null);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<JpVocabWord | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<JpVocabWord | null>(null);
  const [editingWord, setEditingWord] = useState<JpVocabWord | null>(null);

  const loadData = useCallback(async () => {
    const [payload, reviewRes] = await Promise.all([
      fetchWithClientCache(
        JP_VOCAB_CACHE_KEY,
        "/api/jp-vocab",
        parseJpVocabApi,
        { credentials: "include" }
      ),
      fetch("/api/jp-vocab/review", {
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        cache: "no-store",
      }),
    ]);
    setWords(payload.words);
    setRefs(payload.refs);
    setDisplayOrder(payload.display_order);

    const reviewJson = (await reviewRes.json()) as {
      ok: boolean;
      review_progress?: Partial<JpVocabReviewProgress>;
      error?: string;
    };
    if (reviewJson.ok && reviewJson.review_progress) {
      setReviewProgress(normalizeJpVocabReviewProgress(reviewJson.review_progress));
    }
  }, [locale]);

  useEffect(() => {
    if (checking) return;
    if (!user) {
      setLoading(false);
      return;
    }
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await loadData();
        if (!cancelled) setStatus("");
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checking, user, isAdmin, loadData]);

  const reviewCount = useMemo(
    () => normalizeJpVocabReviewCount(prefs.count, words.length),
    [prefs.count, words.length]
  );

  const reviewWords = useMemo(
    () =>
      buildJpVocabReviewWordList(words, displayOrder, {
        count: reviewCount,
        sortMode: prefs.sortMode,
      }),
    [words, displayOrder, reviewCount, prefs.sortMode]
  );

  const reviewWordIds = useMemo(() => reviewWords.map((w) => w.id), [reviewWords]);

  const reviewedWordIds = useMemo(
    () => new Set(reviewProgress.reviewed_word_ids),
    [reviewProgress.reviewed_word_ids]
  );

  const sessionReviewedInPlan = useMemo(
    () => reviewWordIds.filter((id) => reviewedWordIds.has(id)).length,
    [reviewWordIds, reviewedWordIds]
  );

  const wordsById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);

  const dailySeqByWordId = useMemo(
    () => buildJpVocabReviewDailySeqMap(reviewWords, displayOrder, prefs.sortMode),
    [reviewWords, displayOrder, prefs.sortMode]
  );

  const fullDailySeqByWordId = useMemo(
    () => buildJpVocabDailySeqMap(displayOrder.ids),
    [displayOrder.ids]
  );

  const applyPrefs = useCallback((next: ReviewPrefs) => {
    const normalized: ReviewPrefs = {
      count: normalizeJpVocabReviewCount(next.count, 9999),
      sortMode: normalizeJpVocabReviewSortMode(next.sortMode),
    };
    setPrefs(normalized);
    setCountInput(String(normalized.count));
    writeReviewPrefs(normalized);
  }, []);

  const commitCountInput = useCallback(() => {
    applyPrefs({
      ...prefs,
      count: normalizeJpVocabReviewCount(countInput, words.length || 9999),
    });
  }, [applyPrefs, countInput, prefs, words.length]);

  const startReview = useCallback(
    (startWordId?: number) => {
      if (!reviewWordIds.length) {
        setStatus("当前计划没有可复习的词条。");
        return;
      }
      const targetId =
        startWordId ??
        reviewWordIds[
          resolveJpVocabReviewResumeIndex(reviewWordIds, reviewedWordIds).index
        ] ??
        reviewWordIds[0];
      const nextSession = createJpVocabReviewSession(reviewWordIds, targetId);
      if (!nextSession) {
        setStatus("当前计划没有可复习的词条。");
        return;
      }
      setSession(nextSession);
      setShowFlashcard(true);
      setStatus("");
    },
    [reviewWordIds, reviewedWordIds]
  );

  const recordReviewNext = useCallback(
    async (wordId: number) => {
      if (recordingNext) return;
      setRecordingNext(true);
      const startedAt = Date.now();
      try {
        const res = await fetch("/api/jp-vocab/review", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({ action: "review_next", word_id: wordId }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          review_progress?: Partial<JpVocabReviewProgress>;
          error?: string;
        };
        if (!data.ok || !data.review_progress) {
          throw new Error(data.error || "记录复习失败");
        }
        setReviewProgress(normalizeJpVocabReviewProgress(data.review_progress));
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setRecordingNext(false);
      }
    },
    [locale, recordingNext]
  );

  const clearReviewProgress = useCallback(async () => {
    if (clearBusy) return;
    if (!window.confirm("确定清除全部已复习记录？此操作不可撤销。")) return;
    setClearBusy(true);
    setClearProgress(jpVocabSaveProgressDisplayPercent(null));
    clearStartedAtRef.current = Date.now();
    if (clearProgressTimerRef.current) {
      clearInterval(clearProgressTimerRef.current);
    }
    clearProgressTimerRef.current = setInterval(() => {
      setClearProgress(jpVocabSaveProgressPercent(Date.now() - clearStartedAtRef.current));
    }, 120);
    try {
      const res = await fetch("/api/jp-vocab/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ action: "clear" }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        review_progress?: Partial<JpVocabReviewProgress>;
        error?: string;
      };
      if (!data.ok || !data.review_progress) {
        throw new Error(data.error || "清除失败");
      }
      await animateJpVocabSaveProgressTo100(clearStartedAtRef.current, setClearProgress);
      setReviewProgress(normalizeJpVocabReviewProgress(data.review_progress));
      setStatus("已清除全部复习记录。");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      if (clearProgressTimerRef.current) {
        clearInterval(clearProgressTimerRef.current);
        clearProgressTimerRef.current = null;
      }
      setClearBusy(false);
      setClearProgress(null);
    }
  }, [clearBusy, locale]);

  useEffect(() => {
    return () => {
      if (clearProgressTimerRef.current) {
        clearInterval(clearProgressTimerRef.current);
      }
    };
  }, []);

  const handleWordSaved = useCallback((word: JpVocabWord) => {
    setWords((prev) => prev.map((w) => (w.id === word.id ? word : w)));
  }, []);

  const openRefPreview = useCallback(
    (refKey: string, ref?: JpVocabRef) => {
      const meta = resolveJpVocabRefForPreview(refKey, refs, ref);
      setPreviewRef({
        ref: meta,
        cacheVersion: ref?.updated_at ?? refs[refKey]?.updated_at,
      });
    },
    [refs]
  );

  if (checking || loading) {
    return (
      <div className="page-wrap jp-vocab-review-page">
        <p className="page-status">加载中…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-wrap jp-vocab-review-page">
        <h1 className="page-title">日语复习</h1>
        <p className="page-status">请先登录。</p>
        <button type="button" className="btn-rsi-filter" onClick={() => openAuthPanel({ mode: "login" })}>
          登录
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-wrap jp-vocab-review-page">
        <h1 className="page-title">日语复习</h1>
        <p className="page-status">仅管理员可使用日语复习功能。</p>
      </div>
    );
  }

  return (
    <div className="page-wrap jp-vocab-review-page">
      <header className="jp-vocab-review-header">
        <h1 className="page-title">日语复习</h1>
        <p className="jp-vocab-review-sub">
          选择复习数量与排序方式，开始卡片复习。进度保存在独立记录中，仅手动清除时归零（凌晨不自动清除）。
        </p>
      </header>

      {status ? <p className="page-status" role="status">{status}</p> : null}

      <section className="jp-vocab-review-config" aria-label="复习设置">
        <div className="jp-vocab-review-config-row">
          <label className="jp-vocab-review-label" htmlFor="jp-vocab-review-count">
            复习数量
          </label>
          <input
            id="jp-vocab-review-count"
            type="number"
            min={1}
            max={Math.max(1, words.length)}
            className="jp-vocab-review-count-input"
            value={countInput}
            onChange={(e) => setCountInput(e.target.value)}
            onBlur={commitCountInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCountInput();
            }}
          />
          <span className="jp-vocab-review-hint">共 {words.length} 条词条</span>
        </div>

        <div className="jp-vocab-review-config-row">
          <span className="jp-vocab-review-label">排序方式</span>
          <div className="jp-vocab-review-sort-group" role="radiogroup" aria-label="排序方式">
            <label className="jp-vocab-review-sort-opt">
              <input
                type="radio"
                name="jp-vocab-review-sort"
                checked={prefs.sortMode === "seq"}
                onChange={() => applyPrefs({ ...prefs, sortMode: "seq" })}
              />
              按序号（第 1–{reviewCount} 号）
            </label>
            <label className="jp-vocab-review-sort-opt">
              <input
                type="radio"
                name="jp-vocab-review-sort"
                checked={prefs.sortMode === "risk"}
                onChange={() => applyPrefs({ ...prefs, sortMode: "risk" })}
              />
              按{jpVocabPriorityLabel(locale)}降序（前 {reviewCount} 个）
            </label>
          </div>
        </div>

        <div className="jp-vocab-review-toolbar">
          <span className="jp-vocab-review-summary">
            本轮计划 <strong>{reviewWords.length}</strong> 个 · 已复习{" "}
            <strong>{sessionReviewedInPlan}</strong> 个
            {reviewProgress.count > sessionReviewedInPlan
              ? ` · 累计已复习 ${reviewProgress.count} 个`
              : null}
          </span>
          <div className="jp-vocab-review-actions">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              disabled={!reviewWords.length}
              onClick={() => startReview()}
            >
              开始复习
            </button>
            <button
              type="button"
              className="btn-rsi-filter"
              disabled={!reviewWords.length}
              onClick={() => startReview()}
              title="从第一个尚未复习的词继续"
            >
              继续复习
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--danger"
              disabled={clearBusy || reviewProgress.count === 0}
              onClick={() => void clearReviewProgress()}
            >
              清除已复习
            </button>
          </div>
        </div>

        {clearBusy ? (
          <JpVocabSaveProgressBar
            label={jpVocabSaveProgressLabel("save")}
            percent={clearProgress ?? jpVocabSaveProgressDisplayPercent(null)}
            fullWidth
          />
        ) : null}
      </section>

      <div className="jp-vocab-review-table-wrap">
        <table className="jp-vocab-review-table">
          <thead>
            <tr>
              <th>{prefs.sortMode === "seq" ? "序号" : "本轮序"}</th>
              <th>单词 / 语法</th>
              <th>释义</th>
              <th>{jpVocabPriorityLabel(locale)}</th>
              <th>复习状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {reviewWords.length === 0 ? (
              <tr>
                <td colSpan={6} className="jp-vocab-review-empty">
                  暂无词条
                </td>
              </tr>
            ) : (
              reviewWords.map((w) => {
                const seq =
                  prefs.sortMode === "seq"
                    ? fullDailySeqByWordId.get(w.id)
                    : dailySeqByWordId.get(w.id);
                const reviewed = reviewedWordIds.has(w.id);
                const totalDisplay = formatJpVocabTotalReviewsDisplay(w, locale);
                return (
                  <tr key={w.id} className={reviewed ? "jp-vocab-review-row--done" : undefined}>
                    <td data-label="序号">{seq ?? "—"}</td>
                    <td data-label="单词">
                      <span className="jp-vocab-review-word">{w.word}</span>
                      {w.reading ? (
                        <span className="jp-vocab-review-reading">{w.reading}</span>
                      ) : null}
                    </td>
                    <td data-label="释义">{w.meaning || "—"}</td>
                    <td data-label={jpVocabPriorityLabel(locale)}>
                      {jpVocabRiskIndex(w).toFixed(1)}
                      <span className="jp-vocab-review-total" title="复习合计">
                        {" "}
                        · {totalDisplay.label}
                      </span>
                    </td>
                    <td data-label="状态">
                      {reviewed ? (
                        <span className="jp-vocab-admin-review-badge">已复习</span>
                      ) : (
                        <span className="jp-vocab-admin-review-pending">待复习</span>
                      )}
                    </td>
                    <td data-label="操作">
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact"
                        onClick={() => startReview(w.id)}
                      >
                        从此开始
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <JpVocabAdminReviewFlashcardModal
        open={showFlashcard}
        session={session}
        wordsById={wordsById}
        refs={refs}
        locale={locale}
        displayOrder={displayOrder}
        sessionLevel={{}}
        dailySeqByWordId={
          prefs.sortMode === "seq" ? fullDailySeqByWordId : dailySeqByWordId
        }
        todayReviewCount={reviewProgress.count}
        reviewedWordIds={reviewedWordIds}
        recordingNext={recordingNext}
        onClose={() => setShowFlashcard(false)}
        onNavigate={(index) =>
          setSession((prev) => (prev ? { ...prev, currentIndex: index } : prev))
        }
        onReviewNext={recordReviewNext}
        onOpenRef={openRefPreview}
        onViewRemarks={setViewingRemarksWord}
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

      {previewRef ? (
        <JpVocabRefPreviewModal
          open
          refMeta={previewRef.ref}
          cacheVersion={previewRef.cacheVersion}
          onClose={() => setPreviewRef(null)}
        />
      ) : null}

      {viewingRemarksWord ? (
        <JpVocabRemarksViewModal
          open
          word={viewingRemarksWord}
          canDelete
          onClose={() => setViewingRemarksWord(null)}
          onWordUpdated={handleWordSaved}
          onNeedAuth={() => openAuthPanel({ mode: "login" })}
        />
      ) : null}

      {editingRemarksWord ? (
        <JpClassNotesEditModal
          open
          word={editingRemarksWord}
          locale={locale}
          canEdit
          onClose={() => setEditingRemarksWord(null)}
          onSaved={handleWordSaved}
          onSaveFailed={() => {}}
          onNeedAuth={() => openAuthPanel({ mode: "login" })}
        />
      ) : null}

      {editingWord ? (
        <JpVocabEditModal
          open
          word={editingWord}
          locale={locale}
          canEdit
          showMnemonic
          onClose={() => setEditingWord(null)}
          onSaved={handleWordSaved}
          onSaveFailed={() => {}}
          onNeedAuth={() => openAuthPanel({ mode: "login" })}
        />
      ) : null}

      <MobileScrollToTopButton />

      <style jsx>{`
        .jp-vocab-review-page {
          padding-bottom: 2rem;
        }
        .jp-vocab-review-header {
          margin-bottom: 1rem;
        }
        .jp-vocab-review-sub {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.875rem;
          line-height: 1.5;
        }
        .jp-vocab-review-config {
          margin-bottom: 1rem;
          padding: 0.85rem 1rem;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
        }
        .jp-vocab-review-config-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.65rem 1rem;
          margin-bottom: 0.75rem;
        }
        .jp-vocab-review-config-row:last-of-type {
          margin-bottom: 0;
        }
        .jp-vocab-review-label {
          font-size: 0.875rem;
          font-weight: 600;
          min-width: 4.5rem;
        }
        .jp-vocab-review-count-input {
          width: 5.5rem;
          padding: 0.35rem 0.5rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
        }
        .jp-vocab-review-hint {
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-review-sort-group {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1.25rem;
        }
        .jp-vocab-review-sort-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.875rem;
          cursor: pointer;
        }
        .jp-vocab-review-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-top: 0.85rem;
          padding-top: 0.85rem;
          border-top: 1px solid var(--border);
        }
        .jp-vocab-review-summary {
          font-size: 0.875rem;
          color: var(--muted);
        }
        .jp-vocab-review-summary strong {
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-review-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .jp-vocab-review-table-wrap {
          overflow-x: auto;
        }
        .jp-vocab-review-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        .jp-vocab-review-table th,
        .jp-vocab-review-table td {
          padding: 0.55rem 0.65rem;
          border-bottom: 1px solid var(--border);
          text-align: left;
          vertical-align: top;
        }
        .jp-vocab-review-table th {
          font-size: 0.8125rem;
          color: var(--muted);
          white-space: nowrap;
        }
        .jp-vocab-review-row--done {
          opacity: 0.72;
        }
        .jp-vocab-review-word {
          display: block;
          font-weight: 600;
        }
        .jp-vocab-review-reading {
          display: block;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-review-total {
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-review-empty {
          text-align: center;
          color: var(--muted);
          padding: 1.5rem !important;
        }
        :global(.jp-vocab-admin-review-badge) {
          display: inline-flex;
          padding: 0.1rem 0.45rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--fall);
          background: color-mix(in srgb, var(--fall) 16%, transparent);
        }
        :global(.jp-vocab-admin-review-pending) {
          color: var(--muted);
          font-size: 0.8125rem;
        }
        @media (max-width: 720px) {
          .jp-vocab-review-table thead {
            display: none;
          }
          .jp-vocab-review-table tr {
            display: block;
            margin-bottom: 0.75rem;
            padding: 0.65rem;
            border: 1px solid var(--border);
            border-radius: 10px;
          }
          .jp-vocab-review-table td {
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            border: none;
            padding: 0.25rem 0;
          }
          .jp-vocab-review-table td::before {
            content: attr(data-label);
            color: var(--muted);
            flex-shrink: 0;
          }
        }
      `}</style>
    </div>
  );
}
