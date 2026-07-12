"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import type { JpVocabWord } from "@/lib/types";

type Props = {
  open: boolean;
  word: JpVocabWord | null;
  onClose: () => void;
};

export function JpVocabMnemonicViewModal({ open, word, onClose }: Props) {
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

  if (!open || !mounted || !word) return null;

  const mnemonicTrim = (word.mnemonic || "").trim();

  return createPortal(
    <>
      <div
        className="jp-mnemonic-view-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
      >
        <div
          className="jp-mnemonic-view-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-mnemonic-view-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-mnemonic-view-header">
            <div>
              <h2 id="jp-mnemonic-view-title" className="jp-mnemonic-view-title">
                巧记
              </h2>
              <p className="jp-mnemonic-view-subtitle">{word.word}</p>
            </div>
            <button
              type="button"
              className="jp-mnemonic-view-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-mnemonic-view-body">
            {mnemonicTrim ? (
              <p className="jp-mnemonic-view-text">{mnemonicTrim}</p>
            ) : (
              <p className="jp-mnemonic-view-empty">暂未填写巧记，可在「编辑」中补充。</p>
            )}
          </div>

          <div className="jp-mnemonic-view-footer">
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
        .jp-mnemonic-view-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-mnemonic-view-modal {
          display: flex;
          flex-direction: column;
          width: min(640px, 100%);
          max-height: min(80vh, 560px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-mnemonic-view-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-mnemonic-view-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-mnemonic-view-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--accent);
        }

        .jp-mnemonic-view-close {
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

        .jp-mnemonic-view-body {
          padding: 1.1rem 1.25rem;
          overflow-y: auto;
          flex: 1;
          min-height: 8rem;
        }

        .jp-mnemonic-view-text {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font: inherit;
          font-size: 0.9375rem;
          line-height: 1.65;
          color: var(--text);
        }

        .jp-mnemonic-view-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .jp-mnemonic-view-footer {
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
