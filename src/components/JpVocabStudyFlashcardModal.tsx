"use client";

/**
 * @deprecated 学生端请用 JpVocabTeacherQuizFlashcardModal mode="study"
 *（与老师抽问卡同 UI）。本文件仅保留兼容，勿再接入新页面。
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import { JpEditIconButton } from "@/components/JpEditIconButton";
import { JpVocabFlashcardCopyButton } from "@/components/JpVocabFlashcardCopyButton";
import { effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import {
  formatJpVocabClassNotesForDisplay,
  hasJpVocabClassNotes,
  mergeJpVocabWordAfterClassNotesFetch,
} from "@/lib/jp-vocab-class-notes";
import { formatJpVocabSourceDisplay } from "@/lib/jp-vocab-source-display";
import {
  formatJpVocabExampleGlossLine,
  parseJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";
import { JpVocabFuriganaText } from "@/components/JpVocabFuriganaText";
import { resolveJpVocabSharedTeacherLevel } from "@/lib/jp-vocab-review";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabPriorityLabel,
  jpVocabRiskIndex,
  jpVocabTotalReviewsZeroHint,
} from "@/lib/jp-vocab-shared";
import type { JpVocabLevel, JpVocabRef, JpVocabSharedItem, JpVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

type Props = {
  open: boolean;
  item: JpVocabSharedItem | null;
  refs: Record<string, JpVocabRef>;
  locale: "zh" | "en";
  canOperate: boolean;
  onClose: () => void;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  onViewRemarks: (word: JpVocabSharedItem["word"]) => void;
  onEditRemarks: (word: JpVocabSharedItem["word"]) => void;
  onEditWord: (word: JpVocabSharedItem["word"]) => void;
  onWordUpdated?: (word: JpVocabWord) => void;
  /** 子层弹窗（编辑/备注/教案）打开时不响应 Esc 关闭本卡片 */
  nestedModalOpen?: boolean;
};

export function JpVocabStudyFlashcardModal({
  open,
  item,
  refs,
  locale,
  canOperate,
  onClose,
  onOpenRef,
  onViewRemarks,
  onEditRemarks,
  onEditWord,
  onWordUpdated,
  nestedModalOpen = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [notesWord, setNotesWord] = useState<JpVocabWord | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const onCopied = useCallback((message: string) => setCopyToast(message), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !item) {
      setNotesWord(null);
      return;
    }
    setNotesWord(item.word);
  }, [open, item?.word_id, item?.word.updated_at, item?.word]);

  useEffect(() => {
    const word = item?.word;
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
        // 备注接口若漏字段，禁止整词覆盖冲掉列表里已有的例句等
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
    item?.word_id,
    item?.word.class_notes_present,
    item?.word.class_notes,
    locale,
    onWordUpdated,
    item?.word,
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

  if (!open || !mounted || !item) return null;

  const w = notesWord ?? item.word;
  const ref = w.ref_key ? refs[w.ref_key] : undefined;
  const readingTrim = (w.reading || "").trim();
  const wordTrim = w.word.trim();
  const meaningTrim = (w.meaning || "").trim();
  const posTrim = (w.pos || "").trim();
  const selected = resolveJpVocabSharedTeacherLevel(w);
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
  const exampleSentences = parseJpVocabExampleSentenceItems(w.example_sentences);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return createPortal(
    <div
      className="jp-vocab-flashcard-overlay"
      role="presentation"
      onClick={onClose}
    >
      <article
        className="jp-vocab-flashcard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-vocab-flashcard-title"
        onClick={onClose}
      >
        <header className="jp-vocab-flashcard__header">
          <span
            className={`jp-vocab-flashcard__kind${
              w.kind === "grammar" ? " jp-vocab-flashcard__kind--grammar" : ""
            }`}
          >
            {w.kind === "grammar" ? "语法" : "单词"}
          </span>
          <button
            type="button"
            className="jp-vocab-flashcard__close-x"
            aria-label="关闭"
            onClick={(e) => {
              stop(e);
              onClose();
            }}
          >
            ×
          </button>
        </header>

        <div className="jp-vocab-flashcard__hero" id="jp-vocab-flashcard-title">
          {showReadingPrimary ? (
            <div className="jp-vocab-flashcard__reading-row">
              <span className="jp-vocab-flashcard__reading">{readingTrim}</span>
              {showKanjiAside ? (
                <span className="jp-vocab-flashcard__kanji">{wordTrim}</span>
              ) : null}
              <JpVocabFlashcardCopyButton
                readingTrim={readingTrim}
                wordTrim={wordTrim}
                onCopied={onCopied}
              />
            </div>
          ) : (
            <div className="jp-vocab-flashcard__reading-row">
              <span className="jp-vocab-flashcard__word-main">{wordTrim}</span>
              <JpVocabFlashcardCopyButton
                readingTrim={readingTrim}
                wordTrim={wordTrim}
                onCopied={onCopied}
              />
            </div>
          )}
          {!showReadingPrimary && !wordTrim ? (
            <span className="jp-vocab-flashcard__word-main jp-vocab-flashcard__empty">
              —
            </span>
          ) : null}
        </div>

        <dl className="jp-vocab-flashcard__meta">
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
        </dl>

        {exampleSentences.length > 0 ? (
          <section
            className="jp-vocab-flashcard__examples"
            aria-label="例句"
            onClick={stop}
          >
            <div className="jp-vocab-flashcard__examples-head">
              <h3 className="jp-vocab-flashcard__examples-title">例句</h3>
              {w.example_sentences_source?.trim() ? (
                <span className="jp-vocab-flashcard__examples-source">
                  例句来源：{formatJpVocabSourceDisplay(w.example_sentences_source)}
                </span>
              ) : null}
            </div>
            <ol className="jp-vocab-flashcard__examples-list">
              {exampleSentences.map((ex, index) => (
                <li
                  key={`${index}-${ex.text}`}
                  className="jp-vocab-flashcard__examples-item"
                >
                  <span className="jp-vocab-flashcard__examples-index" aria-hidden="true">
                    {index + 1}.
                  </span>
                  <span className="jp-vocab-flashcard__examples-text">
                    <span className="jp-vocab-flashcard__examples-primary">
                      <JpVocabFuriganaText text={ex.text} />
                    </span>
                    {ex.glossLines.map((gloss, glossIndex) => (
                      <span
                        key={`${index}-gloss-${glossIndex}`}
                        className="jp-vocab-flashcard__examples-gloss"
                      >
                        {formatJpVocabExampleGlossLine(gloss)}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="jp-vocab-flashcard__level" onClick={stop}>
          <span className="jp-vocab-flashcard__level-label">老师勾选</span>
          <div className="jp-vocab-flashcard__levels" role="group" aria-label="熟悉程度">
            {LEVELS.map((lv) => {
              const checked = selected === lv.key;
              return (
                <span
                  key={lv.key}
                  className={`jp-vocab-flashcard__level-opt${
                    checked ? " is-checked" : ""
                  }${lv.key === "very" ? " jp-vocab-flashcard__level-opt--very" : ""}${
                    lv.key === "weak" ? " jp-vocab-flashcard__level-opt--weak" : ""
                  }`}
                >
                  <span className="jp-vocab-flashcard__check" aria-hidden="true">
                    {checked ? "✓" : ""}
                  </span>
                  {lv.label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="jp-vocab-flashcard__stats" onClick={stop}>
          <div className="jp-vocab-flashcard__stat">
            <span className="jp-vocab-flashcard__stat-label">{jpVocabPriorityLabel(locale)}</span>
            <span
              className={`jp-vocab-flashcard__risk jp-vocab-flashcard__risk--${riskBadgeTier}`}
            >
              {risk.toFixed(1)}
            </span>
          </div>
          <div className="jp-vocab-flashcard__stat">
            <span className="jp-vocab-flashcard__stat-label">今日抽查</span>
            <span
              className={
                todayChecks > 0
                  ? "jp-vocab-flashcard__stat-value jp-vocab-flashcard__stat-value--active"
                  : "jp-vocab-flashcard__stat-value"
              }
            >
              {todayChecks}
            </span>
          </div>
          <div className="jp-vocab-flashcard__stat">
            <span className="jp-vocab-flashcard__stat-label">复习合计</span>
            <span
              className="jp-vocab-flashcard__stat-value"
              title={totalDisplay.isZero ? jpVocabTotalReviewsZeroHint(locale) : undefined}
            >
              {totalDisplay.label}
            </span>
          </div>
          <div className="jp-vocab-flashcard__stat-grid">
            <span className="chg-dn">非常熟悉 {w.cnt_very}</span>
            <span>一般 {w.cnt_normal}</span>
            <span className="chg-up">不熟悉 {w.cnt_weak}</span>
          </div>
        </div>

        {hasNotes ? (
          <section className="jp-vocab-flashcard__notes" onClick={stop}>
            <div className="jp-vocab-flashcard__notes-head">
              <h3 className="jp-vocab-flashcard__notes-title">备注</h3>
              <div className="jp-vocab-flashcard__notes-actions">
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  title={canOperate ? "查看并编辑备注" : "查看备注"}
                  onClick={() => (canOperate ? onEditRemarks(w) : onViewRemarks(w))}
                >
                  查看
                </button>
                {canOperate ? (
                  <JpEditIconButton
                    title="编辑备注"
                    onClick={() => onEditRemarks(w)}
                  />
                ) : null}
              </div>
            </div>
            <div className="jp-vocab-flashcard__notes-body">
              <JpVocabClassNoteContent
                content={formatJpVocabClassNotesForDisplay(w.class_notes)}
              />
            </div>
          </section>
        ) : canOperate ? (
          <div className="jp-vocab-flashcard__notes-empty" onClick={stop}>
            <span className="jp-vocab-flashcard__notes-title">备注</span>
            <JpEditIconButton title="编辑备注" onClick={() => onEditRemarks(w)} />
          </div>
        ) : null}

        <footer className="jp-vocab-flashcard__footer" onClick={stop}>
          {w.ref_key ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-flashcard__ref-btn"
              onClick={() => onOpenRef(w.ref_key!, ref)}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
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
              {ref?.title ? `教案：${ref.title}` : "查看教案"}
            </button>
          ) : null}
          {canOperate ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => onEditWord(w)}
            >
              编辑词条
            </button>
          ) : null}
          {!hasNotes && !canOperate && !w.ref_key ? (
            <span className="jp-vocab-flashcard__footer-muted">暂无教案与备注</span>
          ) : null}
        </footer>

        <div className="jp-vocab-flashcard__close-row" onClick={stop}>
          <button
            type="button"
            className="btn-rsi-filter jp-vocab-flashcard__close-main"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </article>

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />

      <style jsx global>{`
        .jp-vocab-flashcard-overlay {
          position: fixed;
          inset: 0;
          z-index: 1002;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.75rem, 4vw, 1.5rem);
          background: rgba(8, 12, 18, 0.78);
          backdrop-filter: blur(4px);
        }
        .jp-vocab-flashcard {
          width: min(28rem, 96vw);
          max-height: min(90vh, 42rem);
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
          cursor: pointer;
        }
        .jp-vocab-flashcard__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .jp-vocab-flashcard__kind {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
        }
        .jp-vocab-flashcard__kind--grammar {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          color: var(--accent);
        }
        .jp-vocab-flashcard__close-x {
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
        .jp-vocab-flashcard__close-x:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        }
        .jp-vocab-flashcard__hero {
          text-align: center;
          padding: 0.35rem 0 0.15rem;
        }
        .jp-vocab-flashcard__reading-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.5rem 0.75rem;
        }
        .jp-vocab-flashcard__reading {
          font-size: clamp(1.85rem, 7vw, 2.35rem);
          font-weight: 700;
          letter-spacing: 0.04em;
          line-height: 1.2;
          color: var(--text);
        }
        .jp-vocab-flashcard__kanji {
          font-size: clamp(1.35rem, 5vw, 1.75rem);
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-flashcard__word-main {
          font-size: clamp(1.85rem, 7vw, 2.35rem);
          font-weight: 700;
          line-height: 1.25;
        }
        .jp-vocab-flashcard__empty {
          color: var(--muted);
        }
        .jp-vocab-flashcard__meta {
          margin: 0;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.25rem 0.65rem;
          font-size: 0.9375rem;
          line-height: 1.5;
        }
        .jp-vocab-flashcard__meta dt {
          margin: 0;
          color: var(--muted);
          white-space: nowrap;
        }
        .jp-vocab-flashcard__meta dd {
          margin: 0;
          color: var(--text);
        }
        .jp-vocab-flashcard__examples {
          padding: 0.55rem 0.7rem;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
          background: color-mix(in srgb, var(--panel) 88%, var(--accent) 12%);
          cursor: default;
        }
        .jp-vocab-flashcard__examples-head {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.25rem 0.75rem;
          margin-bottom: 0.4rem;
        }
        .jp-vocab-flashcard__examples-title {
          margin: 0;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--accent);
        }
        .jp-vocab-flashcard__examples-source {
          font-size: 0.75rem;
          color: var(--muted);
        }
        .jp-vocab-flashcard__examples-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .jp-vocab-flashcard__examples-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.35rem 0.45rem;
          align-items: baseline;
        }
        .jp-vocab-flashcard__examples-index {
          font-size: 0.95rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--accent);
        }
        .jp-vocab-flashcard__examples-text {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          font-size: clamp(1.05rem, 3.8vw, 1.25rem);
          font-weight: 600;
          line-height: 1.95;
          letter-spacing: 0.02em;
          color: var(--text);
          word-break: break-word;
        }
        .jp-vocab-flashcard__examples-gloss {
          font-size: 0.9em;
          font-weight: 500;
          color: var(--muted);
        }
        .jp-vocab-flashcard__level {
          padding: 0.65rem 0.7rem;
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent) 6%, var(--bg));
          border: 1px solid color-mix(in srgb, var(--accent) 15%, var(--border));
          cursor: default;
        }
        .jp-vocab-flashcard__level-label {
          display: block;
          margin-bottom: 0.45rem;
          font-size: 0.75rem;
          color: var(--muted);
        }
        .jp-vocab-flashcard__levels {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.5rem;
        }
        .jp-vocab-flashcard__level-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.3rem 0.55rem;
          border-radius: 6px;
          font-size: 0.8125rem;
          border: 1px solid var(--border);
          color: var(--muted);
          background: var(--bg);
        }
        .jp-vocab-flashcard__level-opt.is-checked {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, var(--bg));
        }
        .jp-vocab-flashcard__level-opt--very.is-checked {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 45%, var(--border));
          background: color-mix(in srgb, var(--fall) 10%, var(--bg));
        }
        .jp-vocab-flashcard__level-opt--weak.is-checked {
          color: var(--rise);
          border-color: color-mix(in srgb, var(--rise) 45%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--bg));
        }
        .jp-vocab-flashcard__check {
          width: 1rem;
          text-align: center;
          font-weight: 700;
        }
        .jp-vocab-flashcard__stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem 0.75rem;
          align-items: center;
          font-size: 0.8125rem;
          cursor: default;
        }
        .jp-vocab-flashcard__stat {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .jp-vocab-flashcard__stat-label {
          color: var(--muted);
        }
        .jp-vocab-flashcard__risk {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-flashcard__risk--high {
          color: var(--rise);
        }
        .jp-vocab-flashcard__risk--mid {
          color: var(--accent);
        }
        .jp-vocab-flashcard__risk--low {
          color: var(--fall);
        }
        .jp-vocab-flashcard__stat-value {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }
        .jp-vocab-flashcard__stat-value--active {
          color: var(--accent);
        }
        .jp-vocab-flashcard__stat-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.65rem;
          width: 100%;
          padding-top: 0.15rem;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
        }
        .jp-vocab-flashcard__notes,
        .jp-vocab-flashcard__notes-empty {
          padding: 0.65rem 0.7rem;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--bg);
          cursor: default;
        }
        .jp-vocab-flashcard__notes-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.45rem;
        }
        .jp-vocab-flashcard__notes-title {
          margin: 0;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-flashcard__notes-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .jp-vocab-flashcard__notes-body {
          max-height: 8rem;
          overflow: auto;
          font-size: 0.875rem;
        }
        .jp-vocab-flashcard__notes-empty {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .jp-vocab-flashcard__footer {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          align-items: center;
          padding-top: 0.15rem;
          cursor: default;
        }
        .jp-vocab-flashcard__ref-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .jp-vocab-flashcard__footer-muted {
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-flashcard__close-row {
          display: flex;
          justify-content: center;
          padding-top: 0.35rem;
          cursor: default;
        }
        .jp-vocab-flashcard__close-main {
          min-width: 6.5rem;
        }
      `}</style>
    </div>,
    document.body
  );
}
