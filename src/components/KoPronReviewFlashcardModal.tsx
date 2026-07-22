"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { KoPronSpeakButton } from "@/components/KoPronSpeakButton";
import {
  jpVocabSaveProgressDisplayPercent,
} from "@/lib/jp-vocab-save-progress";
import { speakKoPronLetter } from "@/lib/ko-pron-speak";
import type { KoPronCatalogLetter } from "@/lib/types";

type Props = {
  open: boolean;
  letter: KoPronCatalogLetter | null;
  index: number;
  total: number;
  saveBusy?: boolean;
  savePercent?: number | null;
  saveQueued?: boolean;
  onNext: () => void;
  onClose: () => void;
};

export function KoPronReviewFlashcardModal({
  open,
  letter,
  index,
  total,
  saveBusy = false,
  savePercent = null,
  saveQueued = false,
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

  const reveal = () => {
    if (!letter) return;
    setRevealed(true);
    speakKoPronLetter(letter.letter, letter.reading);
  };

  if (!open || !mounted || !letter) return null;

  return createPortal(
    <div
      className="ko-pron-review-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="ko-pron-review-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ko-pron-review-flashcard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ko-pron-review-top">
          <span className="ko-pron-review-mode">
            复习 · {index + 1}/{total}
          </span>
          <button
            type="button"
            className="ko-pron-review-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <h2
          id="ko-pron-review-flashcard-title"
          className="ko-pron-review-hero"
        >
          {letter.letter}
        </h2>

        {!revealed ? (
          <button
            type="button"
            className="ko-pron-review-reveal"
            onClick={reveal}
          >
            显示读音
          </button>
        ) : (
          <>
            <div className="ko-pron-review-speak">
              <KoPronSpeakButton
                letter={letter.letter}
                reading={letter.reading}
                variant="hero"
              />
            </div>
            <div className="ko-pron-review-body">
              <p className="ko-pron-review-reading">
                {letter.reading || "（无读音）"}
              </p>
              {letter.meaning ? (
                <p className="ko-pron-review-meaning">{letter.meaning}</p>
              ) : null}
              {letter.category ? (
                <p className="ko-pron-review-category">{letter.category}</p>
              ) : null}
            </div>
          </>
        )}

        {saveBusy ? (
          <JpVocabSaveProgressBar
            label={saveQueued ? "排队同步中…" : "正在保存复习进度…"}
            percent={
              savePercent != null
                ? savePercent
                : jpVocabSaveProgressDisplayPercent(null)
            }
            fullWidth
          />
        ) : null}

        <div className="ko-pron-review-actions">
          <button
            type="button"
            className="ko-pron-review-next"
            onClick={onNext}
            disabled={saveBusy}
          >
            {index + 1 >= total ? "完成" : "下一个"}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .ko-pron-review-overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          /* Must be opaque: list behind shows 罗马音; translucent = spoils the quiz */
          background: var(--bg);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .ko-pron-review-card {
          width: min(28rem, 100%);
          max-height: min(92vh, 40rem);
          overflow: auto;
          background: var(--panel);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 1rem;
          padding: 1.1rem 1.2rem 1.25rem;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
        }
        .ko-pron-review-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .ko-pron-review-mode {
          font-size: 0.78rem;
          color: var(--muted);
        }
        .ko-pron-review-close {
          border: none;
          background: transparent;
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
          color: var(--muted);
        }
        .ko-pron-review-hero {
          margin: 0.75rem 0 1rem;
          text-align: center;
          font-weight: 700;
          font-size: 3.2rem;
          line-height: 1.1;
          color: var(--text);
        }
        .ko-pron-review-speak {
          display: flex;
          justify-content: center;
          margin: 0 0 0.85rem;
        }
        .ko-pron-review-reveal,
        .ko-pron-review-next {
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
        .ko-pron-review-reveal:disabled,
        .ko-pron-review-next:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ko-pron-review-reading {
          text-align: center;
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0.35rem 0;
          color: var(--text);
        }
        .ko-pron-review-meaning,
        .ko-pron-review-category {
          text-align: center;
          color: var(--muted);
          margin: 0.25rem 0;
          font-size: 0.95rem;
        }
        .ko-pron-review-actions {
          margin-top: 1rem;
        }
      `}</style>
    </div>,
    document.body
  );
}
