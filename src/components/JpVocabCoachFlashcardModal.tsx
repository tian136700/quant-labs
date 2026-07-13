"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import { JpVocabTeacherQuizFlashcardStyles } from "@/components/JpVocabTeacherQuizFlashcardStyles";
import { JpVocabFlashcardWordHero } from "@/components/JpVocabFlashcardWordHero";
import {
  formatJpVocabClassNotesForDisplay,
  hasJpVocabClassNotes,
} from "@/lib/jp-vocab-class-notes";
import { jpVocabCoachLevelLabel } from "@/lib/jp-vocab-coach";
import { jpVocabTeacherQuizNotesInline } from "@/lib/jp-vocab-teacher-quiz";
import type { JpVocabCoachItem } from "@/lib/jp-vocab-coach-db";
import type { JpVocabRef, JpVocabWord } from "@/lib/types";

export type JpVocabCoachSession = {
  wordIds: number[];
  currentIndex: number;
};

type Props = {
  open: boolean;
  session: JpVocabCoachSession | null;
  itemsByWordId: Map<number, JpVocabCoachItem>;
  wordsById: Map<number, JpVocabWord>;
  refs: Record<string, JpVocabRef>;
  locale: "zh" | "en";
  onClose: () => void;
  onNavigate: (index: number) => void;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  onEditRemarks?: (word: JpVocabWord) => void;
  onWordUpdated?: (word: JpVocabWord) => void;
  nestedModalOpen?: boolean;
};

export function JpVocabCoachFlashcardModal({
  open,
  session,
  itemsByWordId,
  wordsById,
  refs,
  locale,
  onClose,
  onNavigate,
  onOpenRef,
  onEditRemarks,
  onWordUpdated,
  nestedModalOpen = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [notesWord, setNotesWord] = useState<JpVocabWord | null>(null);

  const currentWordId =
    session && session.wordIds[session.currentIndex] != null
      ? session.wordIds[session.currentIndex]
      : null;
  const coachItem = currentWordId != null ? itemsByWordId.get(currentWordId) ?? null : null;
  const word = currentWordId != null ? wordsById.get(currentWordId) ?? coachItem?.word ?? null : null;

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

  if (!open || !mounted || !session || !word || !coachItem || currentWordId == null) return null;

  const w = notesWord ?? word;
  const ref = w.ref_key ? refs[w.ref_key] : undefined;
  const readingTrim = (w.reading || "").trim();
  const wordTrim = w.word.trim();
  const meaningTrim = (w.meaning || "").trim();
  const posTrim = (w.pos || "").trim();
  const hasNotes = hasJpVocabClassNotes(w.class_notes, w.class_notes_present);
  const notesInline =
    hasNotes && jpVocabTeacherQuizNotesInline(w.class_notes || "");
  const total = session.wordIds.length;
  const index = session.currentIndex;
  const atStart = index <= 0;
  const atEnd = index >= total - 1;

  return createPortal(
    <>
      <JpVocabTeacherQuizFlashcardStyles />
      <div
        className="jp-vocab-teacher-quiz-overlay"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="jp-vocab-teacher-quiz-modal jp-vocab-coach-flashcard"
          role="dialog"
          aria-modal="true"
          aria-label="课堂带读"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-vocab-teacher-quiz__header">
            <span className="jp-vocab-teacher-quiz__progress">
              课堂带读 {index + 1} / {total}
            </span>
            <button
              type="button"
              className="jp-vocab-teacher-quiz__close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-vocab-teacher-quiz__body">
            <JpVocabFlashcardWordHero
              readingTrim={readingTrim}
              wordTrim={wordTrim}
              refKey={w.ref_key}
              ref={ref}
              onOpenRef={onOpenRef}
              titleId="jp-vocab-coach-title"
            />

            <div className="jp-vocab-coach-level-badge" aria-label="导出时熟悉程度">
              熟悉程度：{jpVocabCoachLevelLabel(coachItem.level)}
              <span className="jp-vocab-coach-level-badge__hint">（带读页不可修改）</span>
            </div>

            {meaningTrim ? (
              <p className="jp-vocab-teacher-quiz__meaning">{meaningTrim}</p>
            ) : null}
            {posTrim ? (
              <p className="jp-vocab-teacher-quiz__pos">{posTrim}</p>
            ) : null}

            {ref ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact"
                onClick={() => onOpenRef(ref.ref_key, ref)}
              >
                查看教案
              </button>
            ) : null}

            {hasNotes ? (
              <div className="jp-vocab-teacher-quiz__notes">
                <div className="jp-vocab-teacher-quiz__notes-head">
                  <span>备注</span>
                  {onEditRemarks ? (
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact"
                      onClick={() => onEditRemarks(w)}
                    >
                      编辑备注
                    </button>
                  ) : null}
                </div>
                {notesInline ? (
                  <div className="jp-vocab-teacher-quiz__notes-body">
                    <JpVocabClassNoteContent
                      content={formatJpVocabClassNotesForDisplay(w.class_notes)}
                    />
                  </div>
                ) : (
                  <p className="jp-vocab-teacher-quiz__notes-preview">备注较长，请点「编辑备注」查看</p>
                )}
              </div>
            ) : onEditRemarks ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact"
                onClick={() => onEditRemarks(w)}
              >
                添加备注
              </button>
            ) : null}
          </div>

          <div className="jp-vocab-teacher-quiz__footer">
            <button
              type="button"
              className="btn-rsi-filter"
              disabled={atStart}
              onClick={() => onNavigate(index - 1)}
            >
              上一个
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              disabled={atEnd}
              onClick={() => onNavigate(index + 1)}
            >
              下一个
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        .jp-vocab-coach-level-badge {
          margin: 0.75rem 0 0.5rem;
          padding: 0.45rem 0.65rem;
          border-radius: 8px;
          background: rgba(255, 152, 60, 0.12);
          color: var(--text);
          font-size: 0.92rem;
          font-weight: 600;
        }
        .jp-vocab-coach-level-badge__hint {
          margin-left: 0.35rem;
          font-weight: 400;
          color: var(--muted);
          font-size: 0.82rem;
        }
      `}</style>
    </>,
    document.body
  );
}
