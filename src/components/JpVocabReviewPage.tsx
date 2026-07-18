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
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { MobileScrollToTopButton } from "@/components/MobileScrollToTopButton";
import {
  JP_VOCAB_CACHE_KEY,
  parseJpVocabApi,
  type JpVocabApiPayload,
} from "@/lib/jp-api-cache";
import { fetchWithClientCache } from "@/lib/client-swr-cache";
import { buildJpVocabDailySeqMap } from "@/lib/jp-vocab-daily-order";
import { isJpVocabWordQuizzedToday } from "@/lib/jp-vocab-daily-check";
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
  computeJpVocabReviewRoundProgress,
  countJpVocabReviewQuizzedInPlan,
  createJpVocabReviewSession,
  normalizeJpVocabReviewProgress,
  resolveJpVocabReviewFreshStartIndex,
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
  jpVocabPriorityLabel,
  jpVocabRiskIndex,
} from "@/lib/jp-vocab-shared";
import type { JpVocabRef, JpVocabWord } from "@/lib/types";

const JP_VOCAB_REVIEW_PREFS_KEY = "jp_vocab_review_prefs";

type ReviewPrefs = {
  count: number;
  sortMode: JpVocabReviewSortMode;
  /** 上次保存时管理员设置的今日抽查数量；变化时自动同步复习数量 */
  quizTargetAtSave?: number;
};

function resolveReviewPrefs(
  stored: Partial<ReviewPrefs> | null | undefined,
  quizTarget: number
): ReviewPrefs {
  const sortMode = normalizeJpVocabReviewSortMode(stored?.sortMode);
  const savedTarget = stored?.quizTargetAtSave;
  if (
    stored?.count == null ||
    savedTarget == null ||
    savedTarget !== quizTarget
  ) {
    return {
      count: normalizeJpVocabReviewCount(quizTarget, 9999),
      sortMode,
      quizTargetAtSave: quizTarget,
    };
  }
  return {
    count: normalizeJpVocabReviewCount(stored.count, 9999),
    sortMode,
    quizTargetAtSave: quizTarget,
  };
}

function readStoredReviewPrefs(): Partial<ReviewPrefs> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(JP_VOCAB_REVIEW_PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ReviewPrefs>;
  } catch {
    return null;
  }
}

function readReviewPrefs(quizTarget = JP_VOCAB_REVIEW_DEFAULT_COUNT): ReviewPrefs {
  return resolveReviewPrefs(readStoredReviewPrefs(), quizTarget);
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
  const [quizTarget, setQuizTarget] = useState(JP_VOCAB_REVIEW_DEFAULT_COUNT);
  const [prefs, setPrefs] = useState<ReviewPrefs>(() => readReviewPrefs());
  const [countInput, setCountInput] = useState(
    () => String(readReviewPrefs().count)
  );
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

    const nextQuizTarget = payload.teacher_visible_limit.quiz_target;
    setQuizTarget(nextQuizTarget);
    const nextPrefs = resolveReviewPrefs(readStoredReviewPrefs(), nextQuizTarget);
    setPrefs(nextPrefs);
    setCountInput(String(nextPrefs.count));
    writeReviewPrefs(nextPrefs);

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

  const isWordQuizzedToday = useCallback(
    (id: number) => {
      const w = wordsById.get(id);
      return w ? isJpVocabWordQuizzedToday(w) : false;
    },
    [wordsById]
  );

  const reviewRoundProgress = useMemo(
    () =>
      computeJpVocabReviewRoundProgress({
        planWordIds: reviewWordIds,
        currentWordId: reviewWordIds[0] ?? 0,
        reviewedWordIds,
        isQuizzedToday: isWordQuizzedToday,
      }),
    [reviewWordIds, reviewedWordIds, isWordQuizzedToday]
  );

  const reviewQuizzedInPlan = useMemo(
    () => countJpVocabReviewQuizzedInPlan(reviewWordIds, isWordQuizzedToday),
    [reviewWordIds, isWordQuizzedToday]
  );

  const reviewPendingInPlan = useMemo(
    () =>
      reviewWords.filter(
        (w) => !reviewedWordIds.has(w.id) && !isJpVocabWordQuizzedToday(w)
      ).length,
    [reviewWords, reviewedWordIds]
  );

  const dailySeqByWordId = useMemo(
    () => buildJpVocabReviewDailySeqMap(reviewWords, displayOrder, prefs.sortMode),
    [reviewWords, displayOrder, prefs.sortMode]
  );

  const fullDailySeqByWordId = useMemo(
    () => buildJpVocabDailySeqMap(displayOrder.ids),
    [displayOrder.ids]
  );

  const applyPrefs = useCallback(
    (next: ReviewPrefs) => {
      const normalized: ReviewPrefs = {
        count: normalizeJpVocabReviewCount(next.count, 9999),
        sortMode: normalizeJpVocabReviewSortMode(next.sortMode),
        quizTargetAtSave: quizTarget,
      };
      setPrefs(normalized);
      setCountInput(String(normalized.count));
      writeReviewPrefs(normalized);
    },
    [quizTarget]
  );

  const commitCountInput = useCallback(() => {
    applyPrefs({
      ...prefs,
      count: normalizeJpVocabReviewCount(countInput, words.length || 9999),
    });
  }, [applyPrefs, countInput, prefs, words.length]);

  const startReview = useCallback(
    (startWordId?: number, mode: "fresh" | "resume" = "fresh") => {
      if (!reviewWordIds.length) {
        setStatus("当前计划没有可复习的词条。");
        return;
      }
      const defaultIndex =
        mode === "resume"
          ? resolveJpVocabReviewResumeIndex(reviewWordIds, reviewedWordIds).index
          : resolveJpVocabReviewFreshStartIndex(
              reviewWordIds,
              reviewedWordIds,
              isWordQuizzedToday
            ).index;
      const targetId = startWordId ?? reviewWordIds[defaultIndex] ?? reviewWordIds[0];
      const nextSession = createJpVocabReviewSession(reviewWordIds, targetId);
      if (!nextSession) {
        setStatus("当前计划没有可复习的词条。");
        return;
      }
      setSession(nextSession);
      setShowFlashcard(true);
      setStatus("");
    },
    [reviewWordIds, reviewedWordIds, isWordQuizzedToday]
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

  const resetReviewStatus = useCallback(async () => {
    if (clearBusy) return;
    if (
      !window.confirm(
        "确定将全部词条的复习状态重置为「待复习」？进度不会每天自动清空，仅在此手动重置时归零。此操作不可撤销。"
      )
    ) {
      return;
    }
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
      setStatus("已将全部词条重置为待复习。");
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
          选择复习数量与排序方式，开始卡片复习。默认复习数量与「今日抽查数量」（当前 {quizTarget} 个）一致。下方表格的「复习状态」：今日已在抽问页抽查过的显示「已抽问」；卡片复习后显示「已复习」；其余为「待复习」。复习进度<strong>不会每天北京时间 0 点自动清空</strong>，需点击「重置复习状态」才会将全部词条恢复为待复习。
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
            本轮待复习 <strong>{reviewPendingInPlan}</strong> 个
            {reviewQuizzedInPlan > 0 ? (
              <>
                {" "}
                · 已抽问跳过 <strong>{reviewQuizzedInPlan}</strong> 个
              </>
            ) : null}
            {" "}
            · 卡片已复习{" "}
            <strong>{reviewRoundProgress.roundReviewed}</strong> /{" "}
            <strong>{reviewRoundProgress.roundTotal}</strong> 个
            {reviewProgress.count > sessionReviewedInPlan
              ? ` · 累计已复习 ${reviewProgress.count} 个`
              : null}
          </span>
          <div className="jp-vocab-review-actions">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              disabled={!reviewWords.length}
              onClick={() => startReview(undefined, "fresh")}
              title="跳过今日已在抽问页抽查过的词条，从待复习词开始"
            >
              开始复习
            </button>
            <button
              type="button"
              className="btn-rsi-filter"
              disabled={!reviewWords.length}
              onClick={() => startReview(undefined, "resume")}
              title="从第一个尚未复习的词继续"
            >
              继续复习
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--danger"
              disabled={clearBusy || reviewProgress.count === 0}
              title="将全部词条的复习状态重置为待复习（不会每天自动清空）"
              onClick={() => void resetReviewStatus()}
            >
              重置复习状态
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
                const quizzedToday = !reviewed && isJpVocabWordQuizzedToday(w);
                return (
                  <tr
                    key={w.id}
                    className={
                      reviewed
                        ? "jp-vocab-review-row--done"
                        : quizzedToday
                          ? "jp-vocab-review-row--quizzed"
                          : undefined
                    }
                  >
                    <td data-label="序号">{seq ?? "—"}</td>
                    <td data-label="单词">
                      <span className="jp-vocab-review-word">{w.word}</span>
                      {w.reading ? (
                        <span className="jp-vocab-review-reading">{w.reading}</span>
                      ) : null}
                    </td>
                    <td data-label="释义">
                      <div className="jp-vocab-review-meaning">
                        <span>{w.meaning || "—"}</span>
                        <JpVocabSourceLabel
                          source={w.meaning_source}
                          label="释义来源"
                        />
                      </div>
                    </td>
                    <td data-label={jpVocabPriorityLabel(locale)}>
                      {jpVocabRiskIndex(w).toFixed(1)}
                    </td>
                    <td data-label="状态">
                      {reviewed ? (
                        <span className="jp-vocab-admin-review-badge">已复习</span>
                      ) : quizzedToday ? (
                        <span className="jp-vocab-admin-review-badge jp-vocab-admin-review-badge--quizzed">
                          已抽问
                        </span>
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
          refs={refs}
          locale={locale}
          canEdit
          showMnemonic
          onClose={() => setEditingWord(null)}
          onSaved={handleWordSaved}
          onRefUpdated={(ref) => {
            setRefs((prev) => ({ ...prev, [ref.ref_key]: ref }));
          }}
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
        .jp-vocab-review-row--quizzed {
          opacity: 0.88;
        }
        .jp-vocab-review-word {
          display: block;
          font-weight: 600;
        }
        .jp-vocab-review-meaning {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.2rem;
          min-height: 2.6rem;
          padding-bottom: 1rem;
          box-sizing: border-box;
        }
        .jp-vocab-review-meaning :global(.jp-vocab-source-label) {
          font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          font-size: 0.625rem;
          font-weight: 500;
          color: color-mix(in srgb, var(--muted) 78%, transparent);
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
        :global(.jp-vocab-admin-review-badge--quizzed) {
          color: color-mix(in srgb, var(--accent) 88%, var(--text));
          background: color-mix(in srgb, var(--accent) 16%, transparent);
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
