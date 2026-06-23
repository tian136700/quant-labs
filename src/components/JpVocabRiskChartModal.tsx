"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabRiskChart } from "@/components/JpVocabRiskChart";
import type { JpVocabWord } from "@/lib/types";

type Props = {
  open: boolean;
  words: JpVocabWord[];
  onClose: () => void;
};

export function JpVocabRiskChartModal({ open, words, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="jp-vocab-risk-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="jp-vocab-risk-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-vocab-risk-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-vocab-risk-modal-header">
          <p id="jp-vocab-risk-modal-title" className="jp-vocab-risk-modal-section">
            学生学习分析
          </p>
          <button
            type="button"
            className="jp-vocab-risk-modal-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="jp-vocab-risk-modal-body">
          <JpVocabRiskChart words={words} />
        </div>
      </div>
      <style jsx>{`
        .jp-vocab-risk-modal-overlay {
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
        .jp-vocab-risk-modal {
          width: min(920px, 100%);
          max-height: min(92dvh, 720px);
          display: flex;
          flex-direction: column;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-vocab-risk-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem 1rem 0.5rem;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .jp-vocab-risk-modal-section {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
          letter-spacing: 0.02em;
        }
        .jp-vocab-risk-modal-close {
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
        .jp-vocab-risk-modal-close:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        }
        .jp-vocab-risk-modal-body {
          padding: 0.75rem 1rem 1rem;
          overflow: auto;
          flex: 1;
          min-height: 0;
        }
        @media (max-width: 480px) {
          .jp-vocab-risk-modal-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-vocab-risk-modal {
            width: 100%;
            max-height: 94dvh;
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
