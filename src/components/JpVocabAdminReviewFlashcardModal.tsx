"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import { JpVocabFlashcardManualFillExamples } from "@/components/jp-vocab-teacher-quiz-flashcard/JpVocabFlashcardManualFillExamples";
import { JpVocabUsageExamplesCopyButton } from "@/components/JpVocabUsageExamplesCopyButton";
import { JpVocabUsageExamplesPairedContent } from "@/components/JpVocabUsageExamplesPairedContent";
import { JpVocabConnectionSection } from "@/components/JpVocabConnectionSection";
import { buildJpVocabUsageExamplePairs } from "@/lib/jp-vocab-usage-examples-display";
import {
  hasJpVocabConnection,
  jpVocabConnectionShownInlineWithUsage,
} from "@/lib/jp-vocab-connection-ai";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { JpVocabAnnotationSection } from "@/components/JpVocabAnnotationSection";
import { JpVocabCourseLabelSection } from "@/components/JpVocabCourseLabelSection";
import { JpVocabTeacherQuizFlashcardStyles } from "@/components/JpVocabTeacherQuizFlashcardStyles";
import { JpVocabFlashcardWordHero } from "@/components/JpVocabFlashcardWordHero";
import {
  effectiveTodayCheckCount,
  isJpVocabWordQuizzedToday,
} from "@/lib/jp-vocab-daily-check";
import {
  formatJpVocabClassNotesForDisplay,
  hasJpVocabClassNotes,
  mergeJpVocabWordAfterClassNotesFetch,
} from "@/lib/jp-vocab-class-notes";
import { parseJpVocabExampleSentenceItems } from "@/lib/jp-vocab-example-sentences";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabTotalReviewsZeroHint,
} from "@/lib/jp-vocab-shared";
import { jpVocabFinalQuizScoreOrNull } from "@/lib/jp-vocab-quiz-score";
import { jpVocabTeacherQuizNotesInline } from "@/lib/jp-vocab-teacher-quiz";
import { computeJpVocabReviewRoundProgress } from "@/lib/jp-vocab-review-session";
import type { JpVocabReviewSession } from "@/lib/jp-vocab-review-session";
import type { JpVocabRef, JpVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type Props = {
  open: boolean;
  session: JpVocabReviewSession | null;
  wordsById: Map<number, JpVocabWord>;
  refs: Record<string, JpVocabRef>;
  locale: "zh" | "en";
  dailySeqByWordId: ReadonlyMap<number, number>;
  todayReviewCount: number;
  reviewedWordIds: ReadonlySet<number>;
  /** 后台写库队列长度；仅提示，不挡翻页 */
  syncPending?: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onReviewNext: (wordId: number) => void;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  onViewRemarks: (word: JpVocabWord) => void;
  onEditRemarks?: (word: JpVocabWord) => void;
  onEditWord?: (word: JpVocabWord) => void;
  onWordUpdated?: (word: JpVocabWord) => void;
  nestedModalOpen?: boolean;
};

export function JpVocabAdminReviewFlashcardModal({
  open,
  session,
  wordsById,
  refs,
  locale,
  dailySeqByWordId,
  todayReviewCount,
  reviewedWordIds,
  syncPending = 0,
  onClose,
  onNavigate,
  onReviewNext,
  onOpenRef,
  onViewRemarks,
  onEditRemarks,
  onEditWord,
  onWordUpdated,
  nestedModalOpen = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [notesWord, setNotesWord] = useState<JpVocabWord | null>(null);
  /** 本会话内用户点过「展开」的词条；切词时保留，返回上一个可恢复展开态 */
  const [expandedWordIds, setExpandedWordIds] = useState<ReadonlySet<number>>(
    () => new Set()
  );

  const currentWordId =
    session && session.wordIds[session.currentIndex] != null
      ? session.wordIds[session.currentIndex]
      : null;
  const word = currentWordId != null ? wordsById.get(currentWordId) ?? null : null;
  const sessionWordIdsKey = session?.wordIds.join(",") ?? "";
  const contentExpanded =
    currentWordId != null && expandedWordIds.has(currentWordId);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setExpandedWordIds(new Set());
      return;
    }
    setExpandedWordIds(new Set());
  }, [open, sessionWordIdsKey]);

  useEffect(() => {
    if (!open || !word) {
      setNotesWord(null);
      return;
    }
    setNotesWord(word);
  }, [open, word?.id, word?.updated_at, word]);

  useEffect(() => {
    if (!open || !word) return;
    if (!word.class_notes_present || word.class_notes) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/jp-vocab/class-notes?word_id=${encodeURIComponent(String(word.id))}`,
          {
            headers: { [LOCALE_HEADER]: locale },
            credentials: "include",
            cache: "no-store",
          }
        );
        const parsed = await readApiJson<{ ok: boolean; word?: JpVocabWord }>(res);
        if (cancelled || !parsed.ok || !parsed.data.ok || !parsed.data.word) return;
        const merged = mergeJpVocabWordAfterClassNotesFetch(word, parsed.data.word);
        setNotesWord(merged);
        onWordUpdated?.(merged);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    word?.id,
    word?.class_notes_present,
    word?.class_notes,
    locale,
    onWordUpdated,
    word,
  ]);

  useEffect(() => {
    if (!open || nestedModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, nestedModalOpen, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!open || !mounted || !session || !word || currentWordId == null) return null;

  const w = notesWord ?? word;
  const ref = w.ref_key ? refs[w.ref_key] : undefined;
  const readingTrim = (w.reading || "").trim();
  const wordTrim = w.word.trim();
  const meaningTrim = (w.meaning || "").trim();
  const posTrim = (w.pos || "").trim();
  const risk = jpVocabFinalQuizScoreOrNull(w);
  const riskBadgeTier =
    risk == null ? "never" : risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
  const todayChecks = effectiveTodayCheckCount(
    w.today_check_count ?? 0,
    w.today_check_date
  );
  const totalDisplay = formatJpVocabTotalReviewsDisplay(w, locale);
  const showReadingPrimary = Boolean(readingTrim);
  const exampleSentences = parseJpVocabExampleSentenceItems(w.example_sentences);
  const isGrammar = w.kind === "grammar";
  const usageExamplePairs = buildJpVocabUsageExamplePairs(
    w.usage,
    w.example_sentences
  );
  const hasUsageText = Boolean(String(w.usage ?? "").trim());
  const examplesSectionTitle =
    isGrammar || hasUsageText ? "用法 / 例句" : "例句";
  const showExamples =
    contentExpanded &&
    (exampleSentences.length > 0 ||
      Boolean(usageExamplePairs.hasContent) ||
      !isGrammar);
  // 展开后与用法/例句同现：无接序也显示空态，避免预览/复习卡「像没加字段」
  const showConnection =
    contentExpanded &&
    (showExamples || hasJpVocabConnection(w.connection));
  const inlineConnection = jpVocabConnectionShownInlineWithUsage(
    w.usage,
    w.connection
  );
  const hasNotes = hasJpVocabClassNotes(w.class_notes, w.class_notes_present);
  const notesInline =
    hasNotes && jpVocabTeacherQuizNotesInline(w.class_notes || "");
  const dailySeq = dailySeqByWordId.get(w.id);
  const roundProgress = computeJpVocabReviewRoundProgress({
    planWordIds: session.wordIds,
    currentWordId: w.id,
    reviewedWordIds,
    isQuizzedToday: (id) => {
      const item = wordsById.get(id);
      return item ? isJpVocabWordQuizzedToday(item) : false;
    },
  });
  const progressLabel =
    roundProgress.roundTotal > 0
      ? roundProgress.roundPosition != null
        ? `${roundProgress.roundPosition} / ${roundProgress.roundTotal}`
        : `— / ${roundProgress.roundTotal}`
      : "已完成";
  const sessionTotal = roundProgress.roundTotal;
  const sessionReviewed = roundProgress.roundReviewed;
  const sessionPct = roundProgress.percent;
  const sessionComplete = roundProgress.complete;
  const roundRemaining = roundProgress.roundRemaining;
  const canGoPrev = session.currentIndex > 0;
  const canGoNext = session.currentIndex < session.wordIds.length - 1;
  const isLast = !canGoNext;
  const reviewedToday = reviewedWordIds.has(w.id);
  const quizzedToday = !reviewedToday && isJpVocabWordQuizzedToday(w);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const expandContent = () => {
    if (currentWordId == null) return;
    setExpandedWordIds((prev) => {
      if (prev.has(currentWordId)) return prev;
      const next = new Set(prev);
      next.add(currentWordId);
      return next;
    });
  };

  const handleNext = () => {
    onReviewNext(w.id);
    if (canGoNext) {
      onNavigate(session.currentIndex + 1);
    } else {
      onClose();
    }
  };

  return createPortal(
    <div className="jp-vocab-teacher-quiz-overlay" role="presentation">
      <article
        className="jp-vocab-teacher-quiz-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-vocab-admin-review-title"
        onClick={stop}
      >
        <p className="jp-vocab-admin-review__today-banner" role="status">
          已复习 {todayReviewCount} 个单词
        </p>

        <header className="jp-vocab-teacher-quiz__header">
          <div className="jp-vocab-teacher-quiz__header-top">
            <div className="jp-vocab-teacher-quiz__header-left">
              {dailySeq != null ? (
                <span className="jp-vocab-teacher-quiz__seq" title="今日固定序号">
                  序号 {dailySeq}
                </span>
              ) : null}
              {reviewedToday ? (
                <span className="jp-vocab-admin-review__word-badge" title="已通过「下一个」完成复习">
                  已复习
                </span>
              ) : quizzedToday ? (
                <span
                  className="jp-vocab-admin-review__word-badge jp-vocab-admin-review__word-badge--quizzed"
                  title="今日已在抽问页抽查过"
                >
                  已抽问
                </span>
              ) : null}
              <span className="jp-vocab-teacher-quiz__progress">{progressLabel}</span>
            </div>
            <button
              type="button"
              className="jp-vocab-teacher-quiz__close-x"
              aria-label="关闭复习"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div
            className={`jp-vocab-teacher-quiz__header-progress${
              sessionComplete ? " jp-vocab-teacher-quiz__header-progress--complete" : ""
            }`}
          >
            <div className="jp-vocab-teacher-quiz__header-progress-head">
              <span className="jp-vocab-teacher-quiz__header-progress-title">
                本轮复习进度
              </span>
              <span className="jp-vocab-teacher-quiz__header-progress-stats">
                {sessionComplete ? (
                  <span className="jp-vocab-teacher-quiz__header-progress-done">
                    已完成
                  </span>
                ) : (
                  <>
                    <strong>{sessionReviewed}</strong>
                    <span className="jp-vocab-teacher-quiz__header-progress-sep">/</span>
                    {sessionTotal}
                    <span className="jp-vocab-teacher-quiz__header-progress-remaining">
                      （剩余 {roundRemaining}）
                    </span>
                  </>
                )}
              </span>
            </div>
            <div
              className="jp-vocab-teacher-quiz__progress-track"
              role="progressbar"
              aria-valuenow={sessionPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`本轮已复习 ${sessionReviewed} / ${sessionTotal}，剩余 ${roundRemaining}`}
            >
              <div
                className="jp-vocab-teacher-quiz__progress-fill"
                style={{ width: `${sessionPct}%` }}
              />
            </div>
          </div>
        </header>

        <div className="jp-vocab-teacher-quiz__scroll-body">
        <JpVocabFlashcardWordHero
          readingTrim={readingTrim}
          wordTrim={wordTrim}
          kind={w.kind}
          refKey={w.ref_key}
          ref={ref}
          onOpenRef={onOpenRef}
          titleId="jp-vocab-admin-review-title"
          hideReading={!contentExpanded}
        />

        {!contentExpanded ? (
          <div className="jp-vocab-admin-review__reveal-bar">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-admin-review__reveal-btn"
              onClick={expandContent}
            >
              展开所有内容
            </button>
            <p className="jp-vocab-admin-review__reveal-hint" role="note">
              先回忆读音、释义与例句，再点击展开核对（备注始终可见）
            </p>
          </div>
        ) : null}

        <section className="jp-vocab-teacher-quiz__info" aria-label="词条信息">
          {contentExpanded ? (
            <dl className="jp-vocab-teacher-quiz__meta">
              <dt>释义：</dt>
              <dd className={meaningTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}>
                {meaningTrim ? (
                  <span className="jp-vocab-teacher-quiz__meaning-wrap">
                    <span>{meaningTrim}</span>
                    <JpVocabSourceLabel source={w.meaning_source} />
                  </span>
                ) : null}
              </dd>
              <dt>词性：</dt>
              <dd className={posTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}>
                {posTrim ? <span className="jp-vocab-teacher-quiz__pos">{posTrim}</span> : null}
              </dd>
              {!showReadingPrimary ? (
                <>
                  <dt>读音</dt>
                  <dd
                    className={
                      readingTrim || w.kind !== "word"
                        ? ""
                        : "jp-vocab-teacher-quiz__meta-empty"
                    }
                  >
                    {readingTrim || (w.kind === "word" ? "待补全" : "—")}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}
          <div className="jp-vocab-teacher-quiz__actions-row">
            <div className="jp-vocab-teacher-quiz__actions-left">
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-teacher-quiz__action-btn"
                onClick={() => onEditWord?.(w)}
              >
                编辑
              </button>
              {w.ref_key ? (
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
                  title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                  onClick={() => onOpenRef(w.ref_key!, ref)}
                >
                  查看教案
                </button>
              ) : null}
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--success jp-vocab-teacher-quiz__action-btn"
                title="编辑备注"
                onClick={() => onEditRemarks?.(w)}
              >
                编辑备注
              </button>
            </div>
          </div>
        </section>

        {showExamples ? (
          <section
            className="jp-vocab-teacher-quiz__examples"
            aria-label={examplesSectionTitle}
          >
            <div className="jp-vocab-teacher-quiz__examples-head">
              <h3 className="jp-vocab-teacher-quiz__examples-title">
                {examplesSectionTitle}
              </h3>
              <JpVocabFlashcardManualFillExamples
                word={w}
                enabled
                onPatched={(next) => {
                  setNotesWord(next);
                  onWordUpdated?.(next);
                }}
                endAction={
                  <>
                    {onEditWord ? (
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-teacher-quiz__action-btn"
                        title="修改用法与例句（大模型写错或假名不对时可改）"
                        onClick={() => onEditWord(w)}
                      >
                        编辑用法/例句
                      </button>
                    ) : null}
                    <JpVocabUsageExamplesCopyButton
                      model={usageExamplePairs}
                      wordLabel={w.word}
                      connection={w.connection}
                    />
                  </>
                }
              />
            </div>
            <div className="jp-vocab-teacher-quiz__examples-body">
              <JpVocabUsageExamplesPairedContent
                usage={w.usage}
                exampleSentences={w.example_sentences}
                usageSource={w.usage_source}
                exampleSource={w.example_sentences_source}
                connection={w.connection}
                connectionSource={w.connection_source}
                wordLabel={w.word}
                model={usageExamplePairs}
                emptyText={isGrammar ? "暂无用法与例句" : "暂无例句"}
              />
            </div>
          </section>
        ) : null}

        {showConnection && !inlineConnection ? (
          <JpVocabConnectionSection
            connection={w.connection}
            connectionSource={w.connection_source}
            showWhenEmpty
          />
        ) : null}

        <section className="jp-vocab-teacher-quiz__notes">
          <div className="jp-vocab-teacher-quiz__notes-head">
            <h3 className="jp-vocab-teacher-quiz__notes-title">备注</h3>
            <div className="jp-vocab-teacher-quiz__notes-actions">
              {hasNotes ? (
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
                  onClick={() => onViewRemarks(w)}
                >
                  查看
                </button>
              ) : null}
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--success jp-vocab-teacher-quiz__action-btn"
                title="编辑备注"
                onClick={() => onEditRemarks?.(w)}
              >
                编辑备注
              </button>
            </div>
          </div>
          {hasNotes ? (
            notesInline ? (
              <div className="jp-vocab-teacher-quiz__notes-body">
                <JpVocabClassNoteContent
                  content={formatJpVocabClassNotesForDisplay(w.class_notes)}
                />
              </div>
            ) : (
              <p className="jp-vocab-teacher-quiz__notes-preview">备注较长，请点「查看」</p>
            )
          ) : (
            <p className="jp-vocab-teacher-quiz__notes-preview jp-vocab-teacher-quiz__meta-empty">
              暂无备注
            </p>
          )}
        </section>
        <JpVocabAnnotationSection annotation={w.annotation} />
        </div>

        <div className="jp-vocab-teacher-quiz__stats">
          <div className="jp-vocab-teacher-quiz__stat jp-vocab-teacher-quiz__stat--weight">
            <span className="jp-vocab-teacher-quiz__stat-label">
              {locale === "zh" ? (
                <>
                  抽查权重
                  <span className="jp-vocab-teacher-quiz__stat-hint">
                    （数值越大，越应该被抽查）
                  </span>
                </>
              ) : (
                <>
                  Quiz weight
                  <span className="jp-vocab-teacher-quiz__stat-hint">
                    {" "}
                    (higher = more likely to quiz)
                  </span>
                </>
              )}
            </span>
            <span
              className={`jp-vocab-teacher-quiz__risk jp-vocab-teacher-quiz__risk--${riskBadgeTier}`}
              title={
                risk == null
                  ? "从未抽查：不按优先级计分，日序默认置顶"
                  : undefined
              }
            >
              {risk == null ? "—" : risk.toFixed(1)}
            </span>
          </div>
          <div className="jp-vocab-teacher-quiz__stat">
            <span className="jp-vocab-teacher-quiz__stat-label">今日抽查</span>
            <span
              className={
                todayChecks > 0
                  ? "jp-vocab-teacher-quiz__stat-value jp-vocab-teacher-quiz__stat-value--active"
                  : "jp-vocab-teacher-quiz__stat-value"
              }
            >
              {todayChecks}
            </span>
          </div>
          <div className="jp-vocab-teacher-quiz__stat">
            <span className="jp-vocab-teacher-quiz__stat-label">复习合计</span>
            <span
              className="jp-vocab-teacher-quiz__stat-value"
              title={totalDisplay.isZero ? jpVocabTotalReviewsZeroHint(locale) : undefined}
            >
              {totalDisplay.label}
            </span>
          </div>
          <div className="jp-vocab-teacher-quiz__stat-grid">
            <span className="chg-dn">非常熟悉 {w.cnt_very}</span>
            <span>一般 {w.cnt_normal}</span>
            <span className="chg-up">不熟悉 {w.cnt_weak}</span>
          </div>
        </div>

        <JpVocabCourseLabelSection courseLabel={w.course_label} />

        <div className="jp-vocab-teacher-quiz__nav">
          <button
            type="button"
            className="btn-rsi-filter jp-vocab-teacher-quiz__nav-btn jp-vocab-teacher-quiz__nav-btn--prev"
            disabled={!canGoPrev}
            onClick={() => onNavigate(session.currentIndex - 1)}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">上一个</span>
          </button>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz__nav-btn jp-vocab-teacher-quiz__nav-btn--next"
            onClick={handleNext}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">
              {isLast ? "完成复习" : "下一个"}
            </span>
            {!isLast ? (
              <span className="jp-vocab-teacher-quiz__nav-btn-sub">
                {syncPending > 0
                  ? `后台同步中…（队列 ${syncPending}）`
                  : "点击后计入复习进度"}
              </span>
            ) : syncPending > 0 ? (
              <span className="jp-vocab-teacher-quiz__nav-btn-sub">
                后台同步中…（队列 {syncPending}）
              </span>
            ) : null}
          </button>
        </div>
      </article>

      <JpVocabTeacherQuizFlashcardStyles />
      <style jsx global>{`
        .jp-vocab-admin-review__today-banner {
          margin: 0;
          flex-shrink: 0;
          padding: 0.45rem 0.65rem;
          border-radius: 10px;
          text-align: center;
          font-size: 0.875rem;
          font-weight: 600;
          color: color-mix(in srgb, var(--accent) 88%, var(--text));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
        }
        .jp-vocab-admin-review__word-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.1rem 0.45rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--fall);
          background: color-mix(in srgb, var(--fall) 16%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--fall) 32%, transparent);
        }
        .jp-vocab-admin-review__word-badge--quizzed {
          color: color-mix(in srgb, var(--accent) 88%, var(--text));
          background: color-mix(in srgb, var(--accent) 16%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 32%, transparent);
        }
        .jp-vocab-admin-review__reveal-bar {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.45rem;
          margin: 0.65rem 0 0.25rem;
          padding: 0.65rem 0.75rem;
          border-radius: 12px;
          border: 1px dashed color-mix(in srgb, var(--accent) 35%, var(--border));
          background: color-mix(in srgb, var(--accent) 6%, var(--panel));
        }
        .jp-vocab-admin-review__reveal-btn {
          min-width: 10rem;
          font-weight: 600;
        }
        .jp-vocab-admin-review__reveal-hint {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--muted);
          text-align: center;
        }
      `}</style>
    </div>,
    document.body
  );
}
