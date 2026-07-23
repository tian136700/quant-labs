"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import type { EnVocabWord } from "@/lib/types";

type Props = {
  open: boolean;
  word: EnVocabWord | null;
  onClose: () => void;
};

export function EnVocabMnemonicViewModal({ open, word, onClose }: Props) {
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
          aria-labelledby="en-mnemonic-view-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-mnemonic-view-header">
            <div>
              <h2 id="en-mnemonic-view-title" className="jp-mnemonic-view-title">
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
              <p className="jp-mnemonic-view-empty">
                暂未填写巧记，可在「编辑」中补充。
              </p>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .jp-mnemonic-view-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
        }
        .jp-mnemonic-view-modal {
          width: min(480px, 100%);
          max-height: min(80vh, 560px);
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
        }
        .jp-mnemonic-view-header {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid
            color-mix(in srgb, var(--border) 80%, transparent);
        }
        .jp-mnemonic-view-title {
          margin: 0;
          font-size: 1.0625rem;
        }
        .jp-mnemonic-view-subtitle {
          margin: 0.25rem 0 0;
          color: var(--muted);
          font-size: 0.875rem;
        }
        .jp-mnemonic-view-close {
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: transparent;
          color: var(--text);
          font-size: 1.25rem;
          cursor: pointer;
        }
        .jp-mnemonic-view-body {
          padding: 1rem 1.1rem 1.15rem;
          overflow: auto;
        }
        .jp-mnemonic-view-text {
          margin: 0;
          white-space: pre-wrap;
          line-height: 1.55;
        }
        .jp-mnemonic-view-empty {
          margin: 0;
          color: var(--muted);
        }
      `}</style>
    </>,
    document.body
  );
}
