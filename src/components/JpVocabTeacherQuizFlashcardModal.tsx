"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import { effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import { hasJpVocabClassNotes } from "@/lib/jp-vocab-class-notes";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabPriorityLabel,
  jpVocabRiskIndex,
  jpVocabTotalReviewsZeroHint,
} from "@/lib/jp-vocab-shared";
import {
  jpVocabTeacherQuizNotesInline,
  type JpVocabTeacherQuizSession,
} from "@/lib/jp-vocab-teacher-quiz";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

type Props = {
  open: boolean;
  session: JpVocabTeacherQuizSession | null;
  wordsById: Map<number, JpVocabWord>;
  refs: Record<string, JpVocabRef>;
  locale: "zh" | "en";
  displayOrder: JpVocabDailyDisplayOrder;
  sessionLevel: Record<number, JpVocabLevel | undefined>;
  reviewLockedByWordId: Record<number, boolean>;
  savingWordId: number | null;
  dailySeqByWordId: ReadonlyMap<number, number>;
  onClose: () => void;
  onSelectLevel: (wordId: number, level: JpVocabLevel) => void;
  onNavigate: (index: number) => void;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  onViewRemarks: (word: JpVocabWord) => void;
  onWordUpdated?: (word: JpVocabWord) => void;
  nestedModalOpen?: boolean;
};

export function JpVocabTeacherQuizFlashcardModal({
  open,
  session,
  wordsById,
  refs,
  locale,
  displayOrder,
  sessionLevel,
  reviewLockedByWordId,
  savingWordId,
  dailySeqByWordId,
  onClose,
  onSelectLevel,
  onNavigate,
  onOpenRef,
  onViewRemarks,
  onWordUpdated,
  nestedModalOpen = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [notesWord, setNotesWord] = useState<JpVocabWord | null>(null);
  const [nextBlockedHint, setNextBlockedHint] = useState(false);

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
    setNextBlockedHint(false);
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
  const selected = effectiveJpVocabDisplayLevel(w, sessionLevel[w.id], {
    displayOrder,
  });
  const reviewLocked = reviewLockedByWordId[w.id] ?? false;
  const isSaving = savingWordId === w.id;
  const risk = jpVocabRiskIndex(w);
  const riskBadgeTier = risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
  const todayChecks = effectiveTodayCheckCount(
    w.today_check_count ?? 0,
    w.today_check_date
  );
  const totalDisplay = formatJpVocabTotalReviewsDisplay(w, locale);
  const showReadingPrimary = Boolean(readingTrim);
  const showKanjiAside =
    showReadingPrimary && Boolean(wordTrim) && wordTrim !== readingTrim;
  const hasNotes = hasJpVocabClassNotes(w.class_notes, w.class_notes_present);
  const notesInline =
    hasNotes && jpVocabTeacherQuizNotesInline(w.class_notes || "");
  const dailySeq = dailySeqByWordId.get(w.id);
  const progressLabel = `${session.currentIndex + 1} / ${session.wordIds.length}`;
  const canGoPrev = session.currentIndex > 0;
  const canGoNext = session.currentIndex < session.wordIds.length - 1;
  const isLast = session.currentIndex === session.wordIds.length - 1;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const tryGoNext = () => {
    if (!selected) {
      setNextBlockedHint(true);
      return;
    }
    if (isSaving) return;
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
        aria-labelledby="jp-vocab-teacher-quiz-title"
        onClick={stop}
      >
        <header className="jp-vocab-teacher-quiz__header">
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
            <span className="jp-vocab-teacher-quiz__progress">{progressLabel}</span>
          </div>
          <button
            type="button"
            className="jp-vocab-teacher-quiz__close-x"
            aria-label="关闭抽查"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="jp-vocab-teacher-quiz__hero" id="jp-vocab-teacher-quiz-title">
          {showReadingPrimary ? (
            <div className="jp-vocab-teacher-quiz__reading-row">
              <span className="jp-vocab-teacher-quiz__reading">{readingTrim}</span>
              {showKanjiAside ? (
                <span className="jp-vocab-teacher-quiz__kanji">{wordTrim}</span>
              ) : null}
            </div>
          ) : (
            <span className="jp-vocab-teacher-quiz__word-main">{wordTrim}</span>
          )}
          {!showReadingPrimary && !wordTrim ? (
            <span className="jp-vocab-teacher-quiz__word-main jp-vocab-teacher-quiz__empty">
              —
            </span>
          ) : null}
        </div>

        <dl className="jp-vocab-teacher-quiz__meta">
          {meaningTrim ? (
            <>
              <dt>释义</dt>
              <dd>{meaningTrim}</dd>
            </>
          ) : null}
          {posTrim ? (
            <>
              <dt>词性</dt>
              <dd>{posTrim}</dd>
            </>
          ) : null}
          {readingTrim && !showReadingPrimary ? (
            <>
              <dt>读音</dt>
              <dd>{readingTrim}</dd>
            </>
          ) : null}
        </dl>

        <div className="jp-vocab-teacher-quiz__level">
          <span className="jp-vocab-teacher-quiz__level-label">
            熟悉程度（须勾选后才能下一词）
          </span>
          <div className="jp-vocab-teacher-quiz__levels" role="group" aria-label="熟悉程度">
            {LEVELS.map((lv) => {
              const checked = selected === lv.key;
              const levelDisabled = reviewLocked || isSaving;
              return (
                <button
                  key={lv.key}
                  type="button"
                  className={`jp-vocab-teacher-quiz__level-opt${
                    checked ? " is-checked" : ""
                  }${reviewLocked ? " is-locked" : ""}${
                    lv.key === "very" ? " jp-vocab-teacher-quiz__level-opt--very" : ""
                  }${lv.key === "weak" ? " jp-vocab-teacher-quiz__level-opt--weak" : ""}`}
                  disabled={levelDisabled}
                  aria-pressed={checked}
                  title={
                    reviewLocked
                      ? "勾选已满 1 小时，无法再修改"
                      : checked
                        ? "今日已选此项，可点其他选项改选"
                        : "勾选熟悉程度"
                  }
                  onClick={() => {
                    if (levelDisabled) return;
                    setNextBlockedHint(false);
                    onSelectLevel(w.id, lv.key);
                  }}
                >
                  <span className="jp-vocab-teacher-quiz__check" aria-hidden="true">
                    {checked ? "✓" : ""}
                  </span>
                  {lv.label}
                </button>
              );
            })}
          </div>
          {nextBlockedHint && !selected ? (
            <p className="jp-vocab-teacher-quiz__level-hint" role="alert">
              请先勾选当前单词的熟悉程度，再进入下一词。
            </p>
          ) : null}
          {isSaving ? (
            <p className="jp-vocab-teacher-quiz__level-hint" role="status">
              保存中…
            </p>
          ) : null}
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
              {!notesInline ? (
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  onClick={() => onViewRemarks(w)}
                >
                  查看
                </button>
              ) : null}
            </div>
            {notesInline ? (
              <div className="jp-vocab-teacher-quiz__notes-body">
                <JpVocabClassNoteContent content={w.class_notes || ""} />
              </div>
            ) : null}
          </section>
        ) : null}

        <footer className="jp-vocab-teacher-quiz__footer">
          {w.ref_key ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__ref-btn"
              onClick={() => onOpenRef(w.ref_key!, ref)}
            >
              {ref?.title ? `教案：${ref.title}` : "查看教案"}
            </button>
          ) : null}
        </footer>

        <div className="jp-vocab-teacher-quiz__nav">
          <button
            type="button"
            className="btn-rsi-filter jp-vocab-teacher-quiz__nav-btn"
            disabled={!canGoPrev}
            onClick={() => onNavigate(session.currentIndex - 1)}
          >
            上一个
          </button>
          <button
            type="button"
            className={`btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz__nav-btn${
              !selected ? " jp-vocab-teacher-quiz__nav-btn--blocked" : ""
            }`}
            disabled={isSaving}
            onClick={tryGoNext}
          >
            {isLast ? "完成" : "下一个"}
          </button>
        </div>
      </article>

      <style jsx global>{`
        .jp-vocab-teacher-quiz-overlay {
          position: fixed;
          inset: 0;
          z-index: 1002;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.75rem, 4vw, 1.5rem);
          background: rgba(8, 12, 18, 0.78);
          backdrop-filter: blur(8px);
        }
        .jp-vocab-teacher-quiz-card {
          width: min(28rem, 96vw);
          max-height: min(90vh, 44rem);
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          padding: 1.1rem 1.15rem 1rem;
          background: linear-gradient(
            165deg,
            color-mix(in srgb, var(--panel) 92%, #fff 8%) 0%,
            var(--panel) 55%,
            color-mix(in srgb, var(--panel) 94%, var(--accent) 6%) 100%
          );
          border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
          border-radius: 16px;
          box-shadow:
            0 20px 50px rgba(0, 0, 0, 0.38),
            0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent) inset;
        }
        .jp-vocab-teacher-quiz__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .jp-vocab-teacher-quiz__header-left {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.5rem;
        }
        .jp-vocab-teacher-quiz__kind {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__kind--grammar {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__seq,
        .jp-vocab-teacher-quiz__progress {
          font-size: 0.75rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-teacher-quiz__progress {
          font-weight: 600;
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__close-x {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }
        .jp-vocab-teacher-quiz__close-x:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        }
        .jp-vocab-teacher-quiz__hero {
          text-align: center;
          padding: 0.35rem 0 0.15rem;
        }
        .jp-vocab-teacher-quiz__reading-row {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: center;
          gap: 0.5rem 0.75rem;
        }
        .jp-vocab-teacher-quiz__reading {
          font-size: clamp(1.85rem, 7vw, 2.35rem);
          font-weight: 700;
          letter-spacing: 0.04em;
          line-height: 1.2;
        }
        .jp-vocab-teacher-quiz__kanji {
          font-size: clamp(1.35rem, 5vw, 1.75rem);
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__word-main {
          font-size: clamp(1.85rem, 7vw, 2.35rem);
          font-weight: 700;
          line-height: 1.25;
        }
        .jp-vocab-teacher-quiz__empty {
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__meta {
          margin: 0;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.25rem 0.65rem;
          font-size: 0.9375rem;
          line-height: 1.5;
        }
        .jp-vocab-teacher-quiz__meta dt {
          margin: 0;
          color: var(--muted);
          white-space: nowrap;
        }
        .jp-vocab-teacher-quiz__meta dd {
          margin: 0;
        }
        .jp-vocab-teacher-quiz__level {
          padding: 0.65rem 0.7rem;
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent) 6%, var(--bg));
          border: 1px solid color-mix(in srgb, var(--accent) 15%, var(--border));
        }
        .jp-vocab-teacher-quiz__level-label {
          display: block;
          margin-bottom: 0.45rem;
          font-size: 0.75rem;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__levels {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.5rem;
        }
        .jp-vocab-teacher-quiz__level-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.6rem;
          border-radius: 6px;
          font-size: 0.8125rem;
          border: 1px solid var(--border);
          color: var(--muted);
          background: var(--bg);
          cursor: pointer;
        }
        .jp-vocab-teacher-quiz__level-opt:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-vocab-teacher-quiz__level-opt.is-checked {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, var(--bg));
        }
        .jp-vocab-teacher-quiz__level-opt--very.is-checked {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 45%, var(--border));
          background: color-mix(in srgb, var(--fall) 10%, var(--bg));
        }
        .jp-vocab-teacher-quiz__level-opt--weak.is-checked {
          color: var(--rise);
          border-color: color-mix(in srgb, var(--rise) 45%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--bg));
        }
        .jp-vocab-teacher-quiz__check {
          width: 1rem;
          text-align: center;
          font-weight: 700;
        }
        .jp-vocab-teacher-quiz__level-hint {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz__stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem 0.75rem;
          align-items: center;
          font-size: 0.8125rem;
        }
        .jp-vocab-teacher-quiz__stat {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .jp-vocab-teacher-quiz__stat-label {
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__risk {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-teacher-quiz__risk--high {
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz__risk--mid {
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__risk--low {
          color: var(--fall);
        }
        .jp-vocab-teacher-quiz__stat-value {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }
        .jp-vocab-teacher-quiz__stat-value--active {
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__stat-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.65rem;
          width: 100%;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__notes {
          padding: 0.65rem 0.7rem;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--bg);
        }
        .jp-vocab-teacher-quiz__notes-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.45rem;
        }
        .jp-vocab-teacher-quiz__notes-title {
          margin: 0;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__notes-body {
          max-height: 8rem;
          overflow: auto;
          font-size: 0.875rem;
        }
        .jp-vocab-teacher-quiz__footer {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }
        .jp-vocab-teacher-quiz__nav {
          display: flex;
          gap: 0.55rem;
          padding-top: 0.25rem;
        }
        .jp-vocab-teacher-quiz__nav-btn {
          flex: 1 1 0;
          min-width: 0;
        }
        .jp-vocab-teacher-quiz__nav-btn--blocked:not(:disabled) {
          opacity: 0.85;
        }
      `}</style>
    </div>,
    document.body
  );
}
