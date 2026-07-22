"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
} from "@/lib/jp-vocab-save-progress";
import { koPronTeacherQuizModeLabel } from "@/lib/ko-pron-teacher-quiz";
import type { KoPronTeacherQuizMode } from "@/lib/ko-pron-teacher-quiz";
import type { KoPronLetter, KoPronLevel } from "@/lib/types";

const LEVELS: Array<{ key: KoPronLevel; label: string }> = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

type Props = {
  open: boolean;
  letter: KoPronLetter | null;
  mode: KoPronTeacherQuizMode;
  index: number;
  total: number;
  selectedLevel?: KoPronLevel;
  saveBusy?: boolean;
  savePercent?: number | null;
  saveQueued?: boolean;
  previewMode?: boolean;
  onSelectLevel: (level: KoPronLevel) => void;
  onNext: () => void;
  onClose: () => void;
};

export function KoPronTeacherQuizFlashcardModal({
  open,
  letter,
  mode,
  index,
  total,
  selectedLevel,
  saveBusy = false,
  savePercent = null,
  saveQueued = false,
  previewMode = false,
  onSelectLevel,
  onNext,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setRevealed(false);
  }, [letter?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted || !letter) return null;

  const levelDisabled = previewMode || saveBusy;

  return createPortal(
    <div
      className="jp-vocab-flashcard-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="jp-vocab-flashcard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ko-pron-flashcard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-vocab-flashcard-top">
          <span className="jp-vocab-flashcard-mode">
            {koPronTeacherQuizModeLabel(mode)} · {index + 1}/{total}
          </span>
          <button
            type="button"
            className="jp-vocab-flashcard-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <h2 id="ko-pron-flashcard-title" className="jp-vocab-flashcard-hero">
          <span style={{ fontSize: "3.2rem", lineHeight: 1.1 }}>{letter.letter}</span>
        </h2>

        {!revealed ? (
          <button
            type="button"
            className="jp-vocab-flashcard-reveal"
            onClick={() => setRevealed(true)}
          >
            显示读音
          </button>
        ) : (
          <div className="jp-vocab-flashcard-body">
            <p className="jp-vocab-flashcard-reading">
              {letter.reading || "（无读音）"}
            </p>
            {letter.meaning ? (
              <p className="jp-vocab-flashcard-meaning">{letter.meaning}</p>
            ) : null}
            {letter.category ? (
              <p className="jp-vocab-flashcard-pos">{letter.category}</p>
            ) : null}
          </div>
        )}

        {!previewMode ? (
          <div className="jp-vocab-levels" role="group" aria-label="熟悉程度">
            {LEVELS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`jp-vocab-level-btn${
                  selectedLevel === item.key ? " jp-vocab-level-btn--active" : ""
                }`}
                disabled={levelDisabled}
                onClick={() => onSelectLevel(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {saveBusy ? (
          <JpVocabSaveProgressBar
            label={jpVocabSaveProgressLabel("save_level", {
              queued: saveQueued,
            })}
            percent={
              savePercent != null
                ? savePercent
                : jpVocabSaveProgressDisplayPercent(null)
            }
            fullWidth
          />
        ) : null}

        <div className="jp-vocab-flashcard-stats">
          <span>非常熟悉 {letter.cnt_very}</span>
          <span>一般 {letter.cnt_normal}</span>
          <span>不熟悉 {letter.cnt_weak}</span>
        </div>

        <div className="jp-vocab-flashcard-actions">
          {!previewMode ? (
            <button
              type="button"
              className="jp-vocab-flashcard-next"
              onClick={onNext}
              disabled={saveBusy}
            >
              下一个
            </button>
          ) : (
            <button
              type="button"
              className="jp-vocab-flashcard-next"
              onClick={onClose}
            >
              关闭
            </button>
          )}
        </div>
      </div>
      <style jsx global>{`
        .jp-vocab-flashcard-overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .jp-vocab-flashcard {
          width: min(28rem, 100%);
          max-height: min(92vh, 40rem);
          overflow: auto;
          background: #fff;
          border-radius: 1rem;
          padding: 1.1rem 1.2rem 1.25rem;
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.28);
        }
        .jp-vocab-flashcard-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .jp-vocab-flashcard-mode {
          font-size: 0.78rem;
          color: #64748b;
        }
        .jp-vocab-flashcard-close {
          border: none;
          background: transparent;
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
          color: #64748b;
        }
        .jp-vocab-flashcard-hero {
          margin: 0.5rem 0 1rem;
          text-align: center;
          font-weight: 700;
        }
        .jp-vocab-flashcard-reveal,
        .jp-vocab-flashcard-next {
          display: block;
          width: 100%;
          margin-top: 0.75rem;
          border: none;
          border-radius: 0.65rem;
          padding: 0.7rem 1rem;
          background: #f97316;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
        }
        .jp-vocab-flashcard-reveal:disabled,
        .jp-vocab-flashcard-next:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .jp-vocab-flashcard-reading {
          text-align: center;
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0.35rem 0;
        }
        .jp-vocab-flashcard-meaning,
        .jp-vocab-flashcard-pos {
          text-align: center;
          color: #475569;
          margin: 0.25rem 0;
        }
        .jp-vocab-levels {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
          margin-top: 1rem;
        }
        .jp-vocab-level-btn {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 0.55rem;
          padding: 0.55rem 0.35rem;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .jp-vocab-level-btn--active {
          border-color: #f97316;
          background: #fff7ed;
          color: #c2410c;
          font-weight: 600;
        }
        .jp-vocab-level-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-vocab-flashcard-stats {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
          margin-top: 0.9rem;
          font-size: 0.78rem;
          color: #64748b;
        }
        .jp-vocab-flashcard-actions {
          margin-top: 0.35rem;
        }
      `}</style>
    </div>,
    document.body
  );
}
