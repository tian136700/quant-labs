"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatEnVocabExampleGlossLine,
  parseEnVocabExampleSentenceItems,
} from "@/lib/en-vocab-example-sentences";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

export type EnVocabExamplesViewTarget = {
  wordLabel?: string | null;
  text: string | null | undefined;
  source?: string | null;
};

type Props = {
  open: boolean;
  target: EnVocabExamplesViewTarget | null;
  onClose: () => void;
};

export function EnVocabExamplesViewModal({ open, target, onClose }: Props) {
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

  if (!open || !mounted || !target) return null;

  const items = parseEnVocabExampleSentenceItems(target.text);
  const subtitle = (target.wordLabel || "").trim();

  return createPortal(
    <>
      <div
        className="en-vocab-examples-view-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
      >
        <div
          className="en-vocab-examples-view-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="en-vocab-examples-view-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="en-vocab-examples-view-header">
            <div>
              <h2
                id="en-vocab-examples-view-title"
                className="en-vocab-examples-view-title"
              >
                例句
              </h2>
              {subtitle ? (
                <p className="en-vocab-examples-view-subtitle">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="en-vocab-examples-view-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="en-vocab-examples-view-body">
            {items.length ? (
              <ol className="en-vocab-examples-view-list">
                {items.map((item, idx) => {
                  const gloss = item.gloss
                    ? formatEnVocabExampleGlossLine(item.gloss)
                    : "";
                  return (
                    <li
                      key={`${item.text}-${idx}`}
                      className="en-vocab-examples-view-item"
                    >
                      <p className="en-vocab-examples-view-en">{item.text}</p>
                      {gloss ? (
                        <p className="en-vocab-examples-view-gloss">{gloss}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="en-vocab-examples-view-empty">暂无例句。</p>
            )}
            <JpVocabSourceLabel source={target.source} />
          </div>

          <div className="en-vocab-examples-view-footer">
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
        .en-vocab-examples-view-overlay {
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

        .en-vocab-examples-view-modal {
          display: flex;
          flex-direction: column;
          width: min(640px, 100%);
          max-height: min(80vh, 640px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .en-vocab-examples-view-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid
            color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .en-vocab-examples-view-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .en-vocab-examples-view-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--accent);
          word-break: break-word;
        }

        .en-vocab-examples-view-close {
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

        .en-vocab-examples-view-body {
          padding: 1rem 1.15rem;
          overflow-y: auto;
          flex: 1;
          min-height: 8rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .en-vocab-examples-view-list {
          margin: 0;
          padding: 0 0 0 1.15rem;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }

        .en-vocab-examples-view-item {
          margin: 0;
        }

        .en-vocab-examples-view-en {
          margin: 0;
          font-size: 0.9375rem;
          line-height: 1.55;
          color: var(--text);
          word-break: break-word;
        }

        .en-vocab-examples-view-gloss {
          margin: 0.25rem 0 0;
          font-size: 0.8125rem;
          line-height: 1.45;
          color: var(--muted);
          word-break: break-word;
        }

        .en-vocab-examples-view-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .en-vocab-examples-view-footer {
          display: flex;
          justify-content: flex-end;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid
            color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }
      `}</style>
    </>,
    document.body
  );
}
