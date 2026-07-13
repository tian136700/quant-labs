"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { JpVocabWord } from "@/lib/types";

const JpVocabRiskChart = dynamic(
  () => import("@/components/JpVocabRiskChart").then((m) => m.JpVocabRiskChart),
  { ssr: false, loading: () => <p style={{ padding: 16, color: "var(--muted)" }}>加载图表…</p> }
);

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
          width: min(1120px, 98vw);
          max-height: min(92dvh, 780px);
          display: flex;
          flex-direction: column;
          background: var(--panel);
          border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
          border-radius: 15px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-vocab-risk-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem 0.625rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
          flex-shrink: 0;
        }
        .jp-vocab-risk-modal-section {
          margin: 0;
          font-size: clamp(0.9375rem, 3.5vw, 1rem);
          font-weight: 600;
          color: var(--text);
          letter-spacing: 0.01em;
        }
        .jp-vocab-risk-modal-close {
          flex-shrink: 0;
          width: 2.75rem;
          height: 2.75rem;
          border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
          border-radius: 10px;
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
          padding: 0.625rem 1rem 1rem;
          overflow: auto;
          flex: 1;
          min-height: 0;
          -webkit-overflow-scrolling: touch;
        }
        @media (max-width: 767px) {
          .jp-vocab-risk-modal-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-vocab-risk-modal {
            width: 100%;
            max-height: min(94dvh, 100dvh - env(safe-area-inset-top, 0px));
            border-radius: 15px 15px 0 0;
            border-bottom: none;
          }
          .jp-vocab-risk-modal-header {
            padding: 0.75rem 1rem 0.5rem;
          }
          .jp-vocab-risk-modal-body {
            padding: 0.5rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
