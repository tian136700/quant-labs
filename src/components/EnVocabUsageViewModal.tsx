"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EnVocabUsageExamplesPairedContent } from "@/components/EnVocabUsageExamplesPairedContent";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { buildEnVocabUsageExamplePairs } from "@/lib/en-vocab-usage-examples-display";
import type { EnVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

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
    return lockBodyScroll();
  }, [open]);

  if (!open || !mounted || !word) return null;

  const model = buildEnVocabUsageExamplePairs(word.usage, word.example_sentences);

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
                用法与例句
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
            <EnVocabUsageExamplesPairedContent
              usage={word.usage}
              exampleSentences={word.example_sentences}
              usageSource={word.usage_source}
              exampleSource={word.example_sentences_source}
              model={model}
              emptyText="暂未填写用法与例句，可在「编辑」中补充，或等待定时补全。"
            />
          </div>

          <div className="en-usage-view-footer">
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
        .en-usage-view-overlay {
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
        .en-usage-view-modal {
          display: flex;
          flex-direction: column;
          width: min(640px, 100%);
          max-height: min(80vh, 640px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .en-usage-view-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1rem 0.75rem;
          border-bottom: 1px solid var(--border);
        }
        .en-usage-view-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 650;
        }
        .en-usage-view-subtitle {
          margin: 0.25rem 0 0;
          color: var(--muted);
          font-size: 0.9rem;
          word-break: break-word;
        }
        .en-usage-view-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--muted);
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
        }
        .en-usage-view-close:hover {
          background: color-mix(in srgb, var(--muted) 12%, transparent);
          color: var(--text);
        }
        .en-usage-view-body {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 1rem;
        }
        .en-usage-view-footer {
          display: flex;
          justify-content: flex-end;
          padding: 0.75rem 1rem 1rem;
          border-top: 1px solid var(--border);
        }
      `}</style>
    </>,
    document.body
  );
}
