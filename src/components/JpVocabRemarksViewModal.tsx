"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { JpVocabWord } from "@/lib/types";

type Props = {
  open: boolean;
  word: JpVocabWord | null;
  onClose: () => void;
};

export function JpVocabRemarksViewModal({ open, word, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
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

  if (!open || !mounted || !word) return null;

  const body = (word.class_notes || "").trim();

  return createPortal(
    <>
      <div
        className="jp-remarks-view-overlay"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="jp-remarks-view-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-remarks-view-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-remarks-view-header">
            <div>
              <h2 id="jp-remarks-view-title" className="jp-remarks-view-title">
                备注
              </h2>
              <p className="jp-remarks-view-subtitle">{word.word}</p>
            </div>
            <button
              type="button"
              className="jp-remarks-view-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-remarks-view-body">
            {body ? (
              <p className="jp-remarks-view-text">{body}</p>
            ) : (
              <p className="jp-remarks-view-empty">暂无备注</p>
            )}
          </div>

          <div className="jp-remarks-view-footer">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .jp-remarks-view-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-remarks-view-modal {
          display: flex;
          flex-direction: column;
          width: min(520px, 100%);
          max-height: min(80vh, 560px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-remarks-view-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-remarks-view-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-remarks-view-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--accent);
        }

        .jp-remarks-view-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-remarks-view-body {
          padding: 1rem 1.1rem;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
        }

        .jp-remarks-view-text {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.55;
          font-size: 0.875rem;
          color: var(--text);
        }

        .jp-remarks-view-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .jp-remarks-view-footer {
          display: flex;
          justify-content: flex-end;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }
      `}</style>
    </>,
    document.body
  );
}
