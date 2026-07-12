"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import { JpVocabTeacherQuizFlashcardStyles } from "@/components/JpVocabTeacherQuizFlashcardStyles";
import { JpVocabFlashcardWordHero } from "@/components/JpVocabFlashcardWordHero";
import { effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import {
  formatJpVocabClassNotesForDisplay,
  hasJpVocabClassNotes,
} from "@/lib/jp-vocab-class-notes";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabPriorityLabel,
  jpVocabRiskIndex,
  jpVocabTotalReviewsZeroHint,
} from "@/lib/jp-vocab-shared";
import { jpVocabTeacherQuizNotesInline } from "@/lib/jp-vocab-teacher-quiz";
import type { JpVocabAdminReviewSession } from "@/lib/jp-vocab-admin-daily-review";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

type Props = {
  open: boolean;
  session: JpVocabAdminReviewSession | null;
  wordsById: Map<number, JpVocabWord>;
  refs: Record<string, JpVocabRef>;
  locale: "zh" | "en";
  displayOrder: JpVocabDailyDisplayOrder;
  sessionLevel: Record<number, JpVocabLevel | undefined>;
  dailySeqByWordId: ReadonlyMap<number, number>;
  todayReviewCount: number;
  reviewedWordIds: ReadonlySet<number>;
  recordingNext: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onReviewNext: (wordId: number) => Promise<void>;
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
  displayOrder,
  sessionLevel,
  dailySeqByWordId,
  todayReviewCount,
  reviewedWordIds,
  recordingNext,
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

  const currentWordId =
    session && session.wordIds[session.currentIndex] != null
      ? session.wordIds[session.currentIndex]
      : null;
  const word = currentWordId != null ? wordsById.get(currentWordId) ?? null : null;

  useEffect(() => {
    setMounted(true);
  }, []);

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
        setNotesWord(parsed.data.word);
        onWordUpdated?.(parsed.data.word);
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted || !session || !word || currentWordId == null) return null;

  const w = notesWord ?? word;
  const ref = w.ref_key ? refs[w.ref_key] : undefined;
  const readingTrim = (w.reading || "").trim();
  const wordTrim = w.word.trim();
  const meaningTrim = (w.meaning || "").trim();
  const posTrim = (w.pos || "").trim();
  const mnemonicTrim = (w.mnemonic || "").trim();
  const selected = effectiveJpVocabDisplayLevel(w, sessionLevel[w.id], {
    displayOrder,
  });
  const risk = jpVocabRiskIndex(w);
  const riskBadgeTier = risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
  const todayChecks = effectiveTodayCheckCount(
    w.today_check_count ?? 0,
    w.today_check_date
  );
  const totalDisplay = formatJpVocabTotalReviewsDisplay(w, locale);
  const showReadingPrimary = Boolean(readingTrim);
  const hasNotes = hasJpVocabClassNotes(w.class_notes, w.class_notes_present);
  const notesInline =
    hasNotes && jpVocabTeacherQuizNotesInline(w.class_notes || "");
  const dailySeq = dailySeqByWordId.get(w.id);
  const progressLabel = `${session.currentIndex + 1} / ${session.wordIds.length}`;
  const sessionTotal = session.wordIds.length;
  const sessionReviewed = session.wordIds.reduce((count, id) => {
    return reviewedWordIds.has(id) ? count + 1 : count;
  }, 0);
  const sessionPct =
    sessionTotal > 0
      ? Math.min(100, Math.round((sessionReviewed / sessionTotal) * 100))
      : 0;
  const sessionComplete = sessionTotal > 0 && sessionReviewed >= sessionTotal;
  const canGoPrev = session.currentIndex > 0;
  const canGoNext = session.currentIndex < session.wordIds.length - 1;
  const isLast = !canGoNext;
  const reviewedToday = reviewedWordIds.has(w.id);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const handleNext = () => {
    if (recordingNext) return;
    void (async () => {
      await onReviewNext(w.id);
      if (canGoNext) {
        onNavigate(session.currentIndex + 1);
      } else {
        onClose();
      }
    })();
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
          今日已复习 {todayReviewCount} 个单词
        </p>

        <header className="jp-vocab-teacher-quiz__header">
          <div className="jp-vocab-teacher-quiz__header-top">
            <div className="jp-vocab-teacher-quiz__header-left">
              <span
                className={`jp-vocab-teacher-quiz__kind${
                  w.kind === "grammar" ? " jp-vocab-teacher-quiz__kind--grammar" : ""
                }`}
              >
                {w.kind === "grammar" ? "语法" : "单词"}
              </span>
              {dailySeq != null ? (
                <span className="jp-vocab-teacher-quiz__seq" title="今日固定序号">
                  序号 {dailySeq}
                </span>
              ) : null}
              {reviewedToday ? (
                <span className="jp-vocab-admin-review__word-badge" title="今日已通过「下一个」完成复习">
                  今日已复习
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
                <strong>{sessionReviewed}</strong>
                <span className="jp-vocab-teacher-quiz__header-progress-sep">/</span>
                {sessionTotal}
              </span>
            </div>
            <div
              className="jp-vocab-teacher-quiz__progress-track"
              role="progressbar"
              aria-valuenow={sessionPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`本轮已复习 ${sessionReviewed} / ${sessionTotal}`}
            >
              <div
                className="jp-vocab-teacher-quiz__progress-fill"
                style={{ width: `${sessionPct}%` }}
              />
            </div>
          </div>
        </header>

        <JpVocabFlashcardWordHero
          readingTrim={readingTrim}
          wordTrim={wordTrim}
          refKey={w.ref_key}
          ref={ref}
          onOpenRef={onOpenRef}
          titleId="jp-vocab-admin-review-title"
        />

        <section className="jp-vocab-teacher-quiz__info" aria-label="词条信息">
          <dl className="jp-vocab-teacher-quiz__meta">
            <dt>释义：</dt>
            <dd className={meaningTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}>
              {meaningTrim}
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
          {mnemonicTrim ? (
            <div className="jp-vocab-teacher-quiz__mnemonic">
              <p className="jp-vocab-teacher-quiz__mnemonic-label">巧记</p>
              <p className="jp-vocab-teacher-quiz__mnemonic-body">{mnemonicTrim}</p>
            </div>
          ) : (
            <p className="jp-vocab-teacher-quiz__mnemonic-empty" role="note">
              巧记：暂未填写，可在「编辑」中补充联想记忆
            </p>
          )}
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
            </div>
          </div>
        </section>

        <div className="jp-vocab-teacher-quiz__level">
          <p className="jp-vocab-teacher-quiz__level-label" role="note">
            当前熟悉程度
          </p>
          <div className="jp-vocab-level-wrap jp-vocab-teacher-quiz__level-wrap">
            <div
              className="jp-vocab-levels jp-vocab-levels--locked jp-vocab-levels--readonly"
              role="group"
              aria-label="熟悉程度"
            >
              {LEVELS.map((lv) => {
                const checked = selected === lv.key;
                return (
                  <span
                    key={lv.key}
                    className={`jp-vocab-level-opt jp-vocab-level-opt--readonly${
                      checked ? " is-checked" : ""
                    }${lv.key === "very" ? " jp-vocab-level-opt--very" : ""}${
                      lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                    }`}
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
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="jp-vocab-teacher-quiz__stats">
          <div className="jp-vocab-teacher-quiz__stat">
            <span className="jp-vocab-teacher-quiz__stat-label">
              {jpVocabPriorityLabel(locale)}
            </span>
            <span
              className={`jp-vocab-teacher-quiz__risk jp-vocab-teacher-quiz__risk--${riskBadgeTier}`}
            >
              {risk.toFixed(1)}
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

        {hasNotes ? (
          <section className="jp-vocab-teacher-quiz__notes">
            <div className="jp-vocab-teacher-quiz__notes-head">
              <h3 className="jp-vocab-teacher-quiz__notes-title">备注</h3>
              <div className="jp-vocab-teacher-quiz__notes-actions">
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
                  onClick={() => onViewRemarks(w)}
                >
                  查看
                </button>
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
            {notesInline ? (
              <div className="jp-vocab-teacher-quiz__notes-body">
                <JpVocabClassNoteContent
                  content={formatJpVocabClassNotesForDisplay(w.class_notes)}
                />
              </div>
            ) : (
              <p className="jp-vocab-teacher-quiz__notes-preview">备注较长，请点「查看」</p>
            )}
          </section>
        ) : null}

        <div className="jp-vocab-teacher-quiz__nav">
          <button
            type="button"
            className="btn-rsi-filter jp-vocab-teacher-quiz__nav-btn jp-vocab-teacher-quiz__nav-btn--prev"
            disabled={!canGoPrev || recordingNext}
            onClick={() => onNavigate(session.currentIndex - 1)}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">上一个</span>
          </button>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz__nav-btn jp-vocab-teacher-quiz__nav-btn--next"
            disabled={recordingNext}
            onClick={handleNext}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">
              {recordingNext ? "记录中…" : isLast ? "完成复习" : "下一个"}
            </span>
            {!isLast ? (
              <span className="jp-vocab-teacher-quiz__nav-btn-sub">点击后计入今日复习</span>
            ) : null}
          </button>
        </div>
      </article>

      <JpVocabTeacherQuizFlashcardStyles />
      <style jsx global>{`
        .jp-vocab-admin-review__today-banner {
          margin: 0;
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
        :global(.jp-vocab-teacher-quiz__mnemonic) {
          margin: 0.65rem 0 0;
          padding: 0.55rem 0.65rem;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }
        :global(.jp-vocab-teacher-quiz__mnemonic-label) {
          margin: 0 0 0.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent);
        }
        :global(.jp-vocab-teacher-quiz__mnemonic-body) {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.55;
          white-space: pre-wrap;
          word-break: break-word;
        }
        :global(.jp-vocab-teacher-quiz__mnemonic-empty) {
          margin: 0.65rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }
      `}</style>
    </div>,
    document.body
  );
}
