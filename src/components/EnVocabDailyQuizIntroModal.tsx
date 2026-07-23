"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { beijingDateString } from "@/lib/en-vocab-daily-check";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

const STORAGE_KEY = "jp-vocab-daily-intro-v1";
const FOREVER_VALUE = "forever";

export function readEnVocabDailyIntroDismissedDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function markEnVocabDailyIntroDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, beijingDateString());
  } catch {
    /* ignore */
  }
}

export function markEnVocabDailyIntroDismissedForever(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, FOREVER_VALUE);
  } catch {
    /* ignore */
  }
}

export function shouldShowEnVocabDailyIntro(): boolean {
  const stored = readEnVocabDailyIntroDismissedDate();
  if (stored === FOREVER_VALUE) return false;
  return stored !== beijingDateString();
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function EnVocabDailyQuizIntroModal({
  open,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDontShowAgain(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!open || !mounted) return null;

  const handleClose = (honorNever = false) => {
    if (honorNever && dontShowAgain) {
      markEnVocabDailyIntroDismissedForever();
    } else {
      markEnVocabDailyIntroDismissed();
    }
    onClose();
  };

  return createPortal(
    <div
      className="jp-vocab-intro-modal-overlay"
      role="presentation"
      onClick={() => handleClose(false)}
    >
      <div
        className="jp-vocab-intro-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-vocab-intro-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-vocab-intro-modal-header">
          <h2 id="jp-vocab-intro-modal-title" className="jp-vocab-intro-modal-title">
            抽查说明
          </h2>
          <button
            type="button"
            className="jp-vocab-intro-modal-close"
            onClick={() => handleClose(false)}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="jp-vocab-intro-modal-body">
          <p className="jp-vocab-intro-modal-text">
            <strong>提问并勾选</strong>：抽查时向学生提问，学生回答后请勾选「熟悉程度」（非常熟悉 /
            一般 / 不熟悉）。
          </p>
        </div>
        <div className="jp-vocab-intro-modal-footer">
          <label className="jp-vocab-intro-modal-never">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>不再显示此说明</span>
          </label>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            onClick={() => handleClose(true)}
          >
            确定
          </button>
        </div>
      </div>
      <style jsx>{`
        .jp-vocab-intro-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.75rem, 3vw, 1.25rem);
          background: rgba(8, 12, 18, 0.72);
          backdrop-filter: blur(2px);
        }
        .jp-vocab-intro-modal {
          width: min(28rem, 96vw);
          display: flex;
          flex-direction: column;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-vocab-intro-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem 1rem 0.75rem;
          border-bottom: 1px solid var(--border);
        }
        .jp-vocab-intro-modal-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--text);
        }
        .jp-vocab-intro-modal-close {
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
        .jp-vocab-intro-modal-close:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        }
        .jp-vocab-intro-modal-body {
          padding: 1rem;
        }
        .jp-vocab-intro-modal-text {
          margin: 0;
          color: var(--text);
          font-size: 0.9375rem;
          line-height: 1.65;
        }
        .jp-vocab-intro-modal-text strong {
          color: var(--text);
          font-weight: 600;
        }
        .jp-vocab-intro-modal-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          padding: 0 1rem 1rem;
        }
        .jp-vocab-intro-modal-never {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          margin: 0;
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--muted);
          cursor: pointer;
          user-select: none;
        }
        .jp-vocab-intro-modal-never input {
          width: 0.875rem;
          height: 0.875rem;
          margin: 0;
          flex-shrink: 0;
          accent-color: var(--accent);
          cursor: pointer;
        }
        @media (max-width: 480px) {
          .jp-vocab-intro-modal-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-vocab-intro-modal {
            width: 100%;
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
