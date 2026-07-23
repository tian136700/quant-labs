"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EnVocabClassNoteContent } from "@/components/EnVocabClassNoteContent";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import type { EnVocabWord } from "@/lib/types";

type Props = {
  open: boolean;
  word: EnVocabWord | null;
  onClose: () => void;
};

export function EnVocabUsageViewModal({ open, word, onClose }: Props) {
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

  const usageTrim = (word.usage || "").trim();

  return createPortal(
    <>
      <div
        className="en-usage-view-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
      >
        <div
          className="en-usage-view-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="en-usage-view-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="en-usage-view-header">
            <div>
              <h2 id="en-usage-view-title" className="en-usage-view-title">
                用法
                {word.usage_source ? (
                  <JpVocabSourceLabel source={word.usage_source} />
                ) : null}
              </h2>
              <p className="en-usage-view-subtitle">{word.word}</p>
            </div>
            <button
              type="button"
              className="en-usage-view-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="en-usage-view-body">
            {usageTrim ? (
              <EnVocabClassNoteContent
                content={usageTrim}
                imageLabel="用法图片"
              />
            ) : (
              <p className="en-usage-view-empty">
                暂未填写用法，可在「编辑」中补充，或等待定时补全。
              </p>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .en-usage-view-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
        }
        .en-usage-view-modal {
          width: min(560px, 100%);
          max-height: min(85vh, 720px);
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
        }
        .en-usage-view-header {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid
            color-mix(in srgb, var(--border) 80%, transparent);
        }
        .en-usage-view-title {
          margin: 0;
          font-size: 1.0625rem;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }
        .en-usage-view-subtitle {
          margin: 0.25rem 0 0;
          color: var(--muted);
          font-size: 0.875rem;
        }
        .en-usage-view-close {
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: transparent;
          color: var(--text);
          font-size: 1.25rem;
          cursor: pointer;
        }
        .en-usage-view-body {
          padding: 1rem 1.1rem 1.15rem;
          overflow: auto;
        }
        .en-usage-view-empty {
          margin: 0;
          color: var(--muted);
        }
      `}</style>
    </>,
    document.body
  );
}
