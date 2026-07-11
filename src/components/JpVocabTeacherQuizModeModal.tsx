"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { JpVocabTeacherQuizMode } from "@/lib/jp-vocab-teacher-quiz";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: JpVocabTeacherQuizMode) => void;
};

export function JpVocabTeacherQuizModeModal({ open, onClose, onSelect }: Props) {
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
      className="jp-vocab-quiz-mode-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="jp-vocab-quiz-mode-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-vocab-quiz-mode-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-vocab-quiz-mode-header">
          <h2 id="jp-vocab-quiz-mode-title" className="jp-vocab-quiz-mode-title">
            请选择抽查模式
          </h2>
          <button
            type="button"
            className="jp-vocab-quiz-mode-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <p className="jp-vocab-quiz-mode-desc">
          选定模式后将进入抽查卡片。每词须勾选熟悉程度后才能进入下一词；可随时返回上一词修改。
        </p>
        <div className="jp-vocab-quiz-mode-actions">
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-quiz-mode-btn"
            onClick={() => onSelect("sequential")}
          >
            正序抽查
            <span className="jp-vocab-quiz-mode-btn-sub">按今日序号 1 → N</span>
          </button>
          <button
            type="button"
            className="btn-rsi-filter jp-vocab-quiz-mode-btn"
            onClick={() => onSelect("random")}
          >
            随机抽查
            <span className="jp-vocab-quiz-mode-btn-sub">打乱今日可抽查词条</span>
          </button>
        </div>
      </div>
      <style jsx>{`
        .jp-vocab-quiz-mode-overlay {
          position: fixed;
          inset: 0;
          z-index: 1001;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.75rem, 3vw, 1.25rem);
          background: rgba(8, 12, 18, 0.72);
          backdrop-filter: blur(6px);
        }
        .jp-vocab-quiz-mode-modal {
          width: min(24rem, 96vw);
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          padding: 1rem 1rem 1.1rem;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-vocab-quiz-mode-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .jp-vocab-quiz-mode-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 600;
        }
        .jp-vocab-quiz-mode-close {
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
        .jp-vocab-quiz-mode-close:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        }
        .jp-vocab-quiz-mode-desc {
          margin: 0;
          font-size: 0.875rem;
          line-height: 1.6;
          color: var(--muted);
        }
        .jp-vocab-quiz-mode-actions {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .jp-vocab-quiz-mode-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          width: 100%;
          padding: 0.7rem 0.85rem;
          text-align: center;
        }
        .jp-vocab-quiz-mode-btn-sub {
          font-size: 0.75rem;
          font-weight: 400;
          color: var(--muted);
        }
        :global(.btn-rsi-filter--primary) .jp-vocab-quiz-mode-btn-sub {
          color: color-mix(in srgb, currentColor 75%, transparent);
        }
        @media (max-width: 480px) {
          .jp-vocab-quiz-mode-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-vocab-quiz-mode-modal {
            width: 100%;
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
