"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { JpEditIconButton } from "@/components/JpEditIconButton";
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

const JP_VOCAB_LEVEL_SYNC_HINT_SHORT = "勾选后同步给学生复习查看";
const JP_VOCAB_LEVEL_SYNC_HINT = "勾选后，该单词将同步给学生复习查看";

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
  wordSyncState?: Record<number, "queued" | "syncing">;
  dailySeqByWordId: ReadonlyMap<number, number>;
  canOperate?: boolean;
  shareUiEnabled?: boolean;
  shareProgressMap?: Record<number, number>;
  sharedTodayWordIds?: ReadonlySet<number>;
  onClose: () => void;
  /** 最后一词勾选后点「完成」 */
  onComplete: () => void;
  onSelectLevel: (wordId: number, level: JpVocabLevel) => void;
  onNavigate: (index: number) => void;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  onViewRemarks: (word: JpVocabWord) => void;
  onEditRemarks?: (word: JpVocabWord) => void;
  onEditWord?: (word: JpVocabWord) => void;
  onShare?: (wordId: number) => void;
  onUnshare?: (wordId: number) => void;
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
  wordSyncState = {},
  dailySeqByWordId,
  canOperate = false,
  shareUiEnabled = false,
  shareProgressMap = {},
  sharedTodayWordIds,
  onClose,
  onComplete,
  onSelectLevel,
  onNavigate,
  onOpenRef,
  onViewRemarks,
  onEditRemarks,
  onEditWord,
  onShare,
  onUnshare,
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
  const syncPhase = wordSyncState[w.id];
  const isQueued = syncPhase === "queued";
  const isSyncing = syncPhase === "syncing";
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
  const isSharing = w.id in shareProgressMap;
  const sharingPercent = shareProgressMap[w.id] ?? 0;
  const isShared = sharedTodayWordIds?.has(w.id) ?? false;

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
      onComplete();
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
              {w.ref_key ? (
                <button
                  type="button"
                  className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__reading"
                  title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                  onClick={() => onOpenRef(w.ref_key!, ref)}
                >
                  {readingTrim}
                </button>
              ) : (
                <span className="jp-vocab-teacher-quiz__reading">{readingTrim}</span>
              )}
              {showKanjiAside ? (
                w.ref_key ? (
                  <button
                    type="button"
                    className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__kanji"
                    title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                    onClick={() => onOpenRef(w.ref_key!, ref)}
                  >
                    {wordTrim}
                  </button>
                ) : (
                  <span className="jp-vocab-teacher-quiz__kanji">{wordTrim}</span>
                )
              ) : null}
            </div>
          ) : w.ref_key ? (
            <button
              type="button"
              className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__word-main"
              title={ref?.title ? `教案：${ref.title}` : "查看教案"}
              onClick={() => onOpenRef(w.ref_key!, ref)}
            >
              {wordTrim || "—"}
            </button>
          ) : (
            <span className="jp-vocab-teacher-quiz__word-main">{wordTrim || "—"}</span>
          )}
          {w.ref_key ? (
            <button
              type="button"
              className="jp-vocab-teacher-quiz__ref-hint"
              title={ref?.title ? `教案：${ref.title}` : "查看教案"}
              onClick={() => onOpenRef(w.ref_key!, ref)}
            >
              （点击查看教案）
            </button>
          ) : null}
        </div>

        <section className="jp-vocab-teacher-quiz__info" aria-label="词条信息">
          <dl className="jp-vocab-teacher-quiz__meta">
            <dt>释义</dt>
            <dd className={meaningTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}>
              {meaningTrim}
            </dd>
            <dt>词性</dt>
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
          {canOperate ? (
            <div className="jp-vocab-teacher-quiz__actions-row">
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
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
          ) : null}
        </section>

        {canOperate && shareUiEnabled ? (
          <section className="jp-vocab-teacher-quiz__share" aria-label="发给学生">
            {isShared ? (
              <button
                type="button"
                className={`btn-rsi-filter btn-rsi-filter--compact jp-vocab-share-btn jp-vocab-unshare-btn jp-vocab-teacher-quiz__action-btn${
                  reviewLocked ? " jp-vocab-share-btn--locked" : ""
                }`}
                disabled={isSaving || isSharing || reviewLocked}
                title={
                  reviewLocked
                    ? "勾选已满 1 小时，无法再操作"
                    : "从学生「今日日语单词」移除；若共享时自动标记了不熟悉，将一并撤销"
                }
                onClick={() => onUnshare?.(w.id)}
              >
                取消共享
              </button>
            ) : isSharing ? (
              <div className="jp-vocab-share-progress" aria-live="polite">
                <span className="jp-vocab-share-progress-label">
                  正在发给学生，传输中…
                </span>
                <div
                  className="jp-vocab-share-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={sharingPercent}
                  aria-label="发给学生进度"
                >
                  <div
                    className="jp-vocab-share-progress-fill"
                    style={{ width: `${sharingPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="jp-vocab-teacher-quiz__share-stack">
                <button
                  type="button"
                  className={`btn-rsi-filter btn-rsi-filter--compact jp-vocab-share-btn jp-vocab-teacher-quiz__action-btn${
                    reviewLocked ? " jp-vocab-share-btn--locked" : ""
                  }`}
                  disabled={isSaving || isSharing || reviewLocked}
                  title={
                    reviewLocked
                      ? "勾选已满 1 小时，无法再发给学生"
                      : "发给学生「今日日语单词」，并标记为不熟悉"
                  }
                  onClick={() => onShare?.(w.id)}
                >
                  发给学生
                </button>
                {!reviewLocked ? (
                  <span className="jp-vocab-teacher-quiz__share-hint" role="note">
                    学生答不上来或不熟悉时，点此发送给他
                  </span>
                ) : null}
              </div>
            )}
          </section>
        ) : null}

        <div className="jp-vocab-teacher-quiz__level">
          <p className="jp-vocab-teacher-quiz__level-label" role="note">
            根据学生熟悉程度，勾选以下选项
          </p>
          <div className="jp-vocab-level-wrap jp-vocab-teacher-quiz__level-wrap">
            <div className="jp-vocab-levels" role="group" aria-label="学生熟悉程度">
              {LEVELS.map((lv) => {
                const checked = selected === lv.key;
                const levelDisabled = reviewLocked || isSaving;
                return (
                  <button
                    key={lv.key}
                    type="button"
                    className={`jp-vocab-level-opt${
                      checked ? " is-checked" : ""
                    }${reviewLocked ? " jp-vocab-level-opt--locked" : ""}${
                      lv.key === "very" ? " jp-vocab-level-opt--very" : ""
                    }${lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""}`}
                    disabled={levelDisabled}
                    aria-pressed={checked}
                    title={
                      reviewLocked
                        ? "勾选已满 1 小时，无法再修改"
                        : checked
                          ? "今日已选此项，可点其他选项改选"
                          : "勾选学生熟悉程度"
                    }
                    onClick={() => {
                      if (levelDisabled) return;
                      setNextBlockedHint(false);
                      onSelectLevel(w.id, lv.key);
                    }}
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
            <span
              className="jp-vocab-teacher-quiz__level-sync-hint jp-vocab-teacher-quiz__level-sync-hint--desktop"
              role="note"
            >
              {JP_VOCAB_LEVEL_SYNC_HINT_SHORT}
            </span>
            <span
              className="jp-vocab-teacher-quiz__level-sync-hint jp-vocab-teacher-quiz__level-sync-hint--mobile"
              role="note"
            >
              {JP_VOCAB_LEVEL_SYNC_HINT}
            </span>
          </div>
          {nextBlockedHint && !selected ? (
            <p className="jp-vocab-teacher-quiz__level-hint" role="alert">
              请先勾选学生的熟悉程度，再进入下一词。
            </p>
          ) : null}
          {isSharing ? (
            <div className="jp-vocab-share-progress jp-vocab-teacher-quiz__level-progress" aria-live="polite">
              <span className="jp-vocab-share-progress-label">正在同步到学生端…</span>
              <div
                className="jp-vocab-share-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={sharingPercent}
                aria-label="同步到学生端进度"
              >
                <div
                  className="jp-vocab-share-progress-fill"
                  style={{ width: `${sharingPercent}%` }}
                />
              </div>
            </div>
          ) : isQueued ? (
            <p className="jp-vocab-teacher-quiz__level-sync-status" role="status">
              排队同步中…
            </p>
          ) : isSyncing ? (
            <p className="jp-vocab-teacher-quiz__level-sync-status" role="status">
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

        {hasNotes || canOperate ? (
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
                {canOperate ? (
                  <JpEditIconButton
                    title="编辑备注"
                    className="jp-vocab-teacher-quiz__notes-edit-btn"
                    onClick={() => onEditRemarks?.(w)}
                  />
                ) : null}
              </div>
            </div>
            {hasNotes ? (
              notesInline ? (
                <div className="jp-vocab-teacher-quiz__notes-body">
                  <JpVocabClassNoteContent content={w.class_notes || ""} />
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
        ) : null}

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
            className={`btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz__nav-btn jp-vocab-teacher-quiz__nav-btn--next${
              !selected ? " jp-vocab-teacher-quiz__nav-btn--blocked" : ""
            }`}
            disabled={isSaving}
            onClick={tryGoNext}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">
              {isLast ? "完成抽查" : "下一个"}
            </span>
            {!isLast ? (
              <span className="jp-vocab-teacher-quiz__nav-btn-sub">勾选后可点</span>
            ) : null}
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
          padding: clamp(0.5rem, 3vw, 1rem);
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          background: rgba(8, 12, 18, 0.78);
          backdrop-filter: blur(8px);
          scrollbar-width: none;
        }
        .jp-vocab-teacher-quiz-overlay::-webkit-scrollbar {
          display: none;
        }
        .jp-vocab-teacher-quiz-card {
          width: min(32rem, 96vw);
          flex-shrink: 0;
          overflow: visible;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.85rem 1rem 0.9rem;
          margin: auto;
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
          padding: 0.15rem 0 0;
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
        .jp-vocab-teacher-quiz__word-link {
          border: none;
          background: transparent;
          padding: 0;
          font: inherit;
          color: var(--accent);
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 0.15em;
        }
        .jp-vocab-teacher-quiz__word-link.jp-vocab-teacher-quiz__reading {
          font-size: clamp(1.85rem, 7vw, 2.35rem);
          font-weight: 700;
          letter-spacing: 0.04em;
          line-height: 1.2;
        }
        .jp-vocab-teacher-quiz__word-link.jp-vocab-teacher-quiz__kanji {
          font-size: clamp(1.35rem, 5vw, 1.75rem);
          font-weight: 600;
        }
        .jp-vocab-teacher-quiz__word-link:hover {
          color: color-mix(in srgb, var(--accent) 80%, #fff);
        }
        .jp-vocab-teacher-quiz__ref-hint {
          display: block;
          margin-top: 0.25rem;
          border: none;
          background: transparent;
          padding: 0;
          font: inherit;
          font-size: 0.75rem;
          color: var(--accent);
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 0.12em;
        }
        .jp-vocab-teacher-quiz__ref-hint:hover {
          color: color-mix(in srgb, var(--accent) 80%, #fff);
        }
        .jp-vocab-teacher-quiz__info {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding: 0.5rem 0.65rem;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
        }
        .jp-vocab-teacher-quiz__meta {
          margin: 0;
          display: grid;
          grid-template-columns: 3rem 1fr;
          gap: 0.25rem 0.65rem;
          font-size: 0.875rem;
          line-height: 1.4;
        }
        .jp-vocab-teacher-quiz__meta dt {
          margin: 0;
          color: var(--muted);
          white-space: nowrap;
          font-weight: 500;
        }
        .jp-vocab-teacher-quiz__meta dd {
          margin: 0;
          color: var(--text);
        }
        .jp-vocab-teacher-quiz__meta-empty {
          color: var(--muted);
          font-style: italic;
        }
        .jp-vocab-teacher-quiz__pos {
          display: inline-block;
          padding: 0.1rem 0.45rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__actions-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.45rem;
          padding-top: 0.15rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
        }
        .jp-vocab-teacher-quiz__action-btn {
          min-height: 1.85rem;
        }
        .jp-vocab-teacher-quiz__share {
          width: 100%;
        }
        .jp-vocab-teacher-quiz__share-stack {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
        }
        .jp-vocab-teacher-quiz__share-hint {
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-share-progress {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.3rem;
          width: 100%;
          padding: 0.35rem 0.45rem;
          border-radius: 6px;
          border: 1px solid color-mix(in srgb, #f0a840 45%, var(--border));
          background: color-mix(in srgb, var(--panel) 90%, #f0a840 10%);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-share-progress-label {
          font-size: 0.75rem;
          line-height: 1.3;
          color: #f0a840;
          text-align: center;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-share-progress-track {
          height: 0.4rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--border) 70%, transparent);
          overflow: hidden;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-share-progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, #f0a840 80%, #fff),
            #f0a840
          );
          transition: width 0.2s linear;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-share-btn:not(:disabled):not(.jp-vocab-unshare-btn):hover {
          color: #ffc860;
          border-color: color-mix(in srgb, #f0a840 65%, var(--border));
        }
        .jp-vocab-teacher-quiz__level {
          padding: 0.5rem 0.6rem;
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent) 6%, var(--bg));
          border: 1px solid color-mix(in srgb, var(--accent) 15%, var(--border));
        }
        .jp-vocab-teacher-quiz__level-label {
          margin: 0 0 0.4rem;
          font-size: 0.8125rem;
          font-weight: 600;
          line-height: 1.35;
          text-align: center;
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz__level-wrap {
          width: 100%;
          align-items: stretch;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-wrap {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          max-width: 100%;
          width: 100%;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-levels {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem 0.5rem;
          min-width: 0;
          width: 100%;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          min-height: 2rem;
          padding: 0.35rem 0.5rem;
          font-size: 0.8125rem;
          font-weight: 400;
          cursor: pointer;
          white-space: nowrap;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: var(--text);
          font: inherit;
          line-height: 1.3;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-check-box {
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
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt.is-checked .jp-vocab-check-box {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 18%, var(--bg));
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--very.is-checked {
          color: var(--fall);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--very.is-checked .jp-vocab-check-box {
          border-color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, var(--bg));
          color: var(--fall);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--weak.is-checked {
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--weak.is-checked .jp-vocab-check-box {
          border-color: var(--rise);
          background: color-mix(in srgb, var(--rise) 18%, var(--bg));
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt.is-checked {
          background: rgba(61, 139, 253, 0.08);
          font-weight: 400;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.04);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-vocab-teacher-quiz__level-sync-hint {
          max-width: 100%;
          font-size: 0.6875rem;
          line-height: 1.4;
          color: var(--muted);
          text-align: center;
          font-weight: 400;
        }
        .jp-vocab-teacher-quiz__level-sync-hint--desktop {
          display: block;
        }
        .jp-vocab-teacher-quiz__level-sync-hint--mobile {
          display: none;
        }
        .jp-vocab-teacher-quiz__level-hint {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz__level-sync-status {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          text-align: center;
        }
        .jp-vocab-teacher-quiz__level-progress {
          margin: 0.45rem auto 0;
          max-width: 100%;
        }
        .jp-vocab-teacher-quiz__stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.55rem;
          align-items: center;
          font-size: 0.75rem;
          padding: 0.35rem 0.45rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
          background: color-mix(in srgb, var(--bg) 40%, var(--panel));
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
          gap: 0.35rem 0.55rem;
          width: 100%;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
          padding-top: 0.15rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
        }
        .jp-vocab-teacher-quiz__notes {
          padding: 0.45rem 0.6rem;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--bg);
        }
        .jp-vocab-teacher-quiz__notes-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }
        .jp-vocab-teacher-quiz__notes-actions {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .jp-vocab-teacher-quiz__notes-title {
          margin: 0;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__notes-preview {
          margin: 0;
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__notes-body {
          overflow: visible;
          font-size: 0.8125rem;
          line-height: 1.45;
        }
        .jp-vocab-teacher-quiz__nav {
          display: flex;
          gap: 0.45rem;
          padding-top: 0.15rem;
        }
        .jp-vocab-teacher-quiz__nav-btn {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.05rem;
          min-height: 2.35rem;
        }
        .jp-vocab-teacher-quiz__nav-btn-main {
          font-size: 0.9375rem;
          font-weight: 600;
          line-height: 1.2;
        }
        .jp-vocab-teacher-quiz__nav-btn-sub {
          display: none;
          font-size: 0.6875rem;
          font-weight: 400;
          opacity: 0.85;
          line-height: 1.2;
        }
        .jp-vocab-teacher-quiz__nav-btn--blocked:not(:disabled) {
          opacity: 0.85;
        }
        @media (max-width: 768px) {
          .jp-vocab-teacher-quiz-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-vocab-teacher-quiz-card {
            width: 100%;
            border-radius: 16px 16px 0 0;
            gap: 0.4rem;
            padding: 0.65rem 0.8rem calc(0.55rem + env(safe-area-inset-bottom, 0px));
          }
          .jp-vocab-teacher-quiz__reading {
            font-size: clamp(1.45rem, 6vw, 1.85rem);
          }
          .jp-vocab-teacher-quiz__word-link.jp-vocab-teacher-quiz__reading {
            font-size: clamp(1.45rem, 6vw, 1.85rem);
          }
          .jp-vocab-teacher-quiz__kanji,
          .jp-vocab-teacher-quiz__word-main {
            font-size: clamp(1.15rem, 4.5vw, 1.45rem);
          }
          .jp-vocab-teacher-quiz__ref-hint {
            margin-top: 0.1rem;
            font-size: 0.6875rem;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-wrap {
            align-items: stretch;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-levels {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0;
            border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
            border-radius: 10px;
            overflow: hidden;
            background: color-mix(in srgb, var(--bg) 60%, var(--panel));
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt {
            min-height: 2.65rem;
            padding: 0.375rem 0.25rem;
            flex: 1 1 0;
            justify-content: center;
            font-size: clamp(0.6875rem, 3vw, 0.8125rem);
            font-weight: 500;
            border: none;
            border-radius: 0;
            border-right: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
            background: transparent;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt:last-child {
            border-right: none;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-check-box {
            display: none;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt.is-checked {
            background: color-mix(in srgb, var(--accent) 18%, var(--panel));
            color: var(--accent);
            font-weight: 600;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--very.is-checked {
            background: color-mix(in srgb, var(--fall) 16%, var(--panel));
            color: var(--fall);
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--weak.is-checked {
            background: color-mix(in srgb, var(--rise) 16%, var(--panel));
            color: var(--rise);
          }
          .jp-vocab-teacher-quiz__level-sync-hint--desktop {
            display: none;
          }
          .jp-vocab-teacher-quiz__level-sync-hint--mobile {
            display: block;
            font-size: clamp(0.6875rem, 2.8vw, 0.75rem);
            padding: 0.15rem 0.25rem 0;
          }
          .jp-vocab-teacher-quiz__actions-row {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.35rem;
            width: 100%;
          }
          .jp-vocab-teacher-quiz__action-btn {
            width: 100%;
            min-height: 2.25rem;
            font-size: 0.8125rem;
            font-weight: 600;
          }
          .jp-vocab-teacher-quiz__share-stack .jp-vocab-teacher-quiz__action-btn {
            width: 100%;
          }
          .jp-vocab-teacher-quiz__nav {
            gap: 0.5rem;
            padding-top: 0.2rem;
          }
          .jp-vocab-teacher-quiz__nav-btn {
            min-height: 2.75rem;
            padding: 0.5rem 0.65rem;
            border-radius: 10px;
          }
          .jp-vocab-teacher-quiz__nav-btn--prev {
            flex: 0 0 5rem;
          }
          .jp-vocab-teacher-quiz__nav-btn--next {
            flex: 1 1 auto;
          }
          .jp-vocab-teacher-quiz__nav-btn-main {
            font-size: 0.9375rem;
          }
          .jp-vocab-teacher-quiz__nav-btn-sub {
            display: block;
            font-size: 0.625rem;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
