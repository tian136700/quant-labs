"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  alignLessonItemMeanings,
  parseLessonContent,
} from "@/lib/jp-lesson-shared";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";

export type JpLessonMeaningsViewTarget = {
  lessonId: number;
  content: string;
  meanings: string | null | undefined;
};

type Props = {
  open: boolean;
  target: JpLessonMeaningsViewTarget | null;
  onClose: () => void;
};

export function JpLessonMeaningsViewModal({ open, target, onClose }: Props) {
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

  if (!open || !mounted || !target) return null;

  const labels = parseLessonContent(target.content);
  const aligned = alignLessonItemMeanings(target.content, target.meanings);
  const rows = labels
    .map((label, index) => {
      const meaning = aligned[index]?.trim();
      if (!meaning) return null;
      return { label, meaning };
    })
    .filter((item): item is { label: string; meaning: string } => item != null);

  return createPortal(
    <>
      <div
        className="jp-lesson-meanings-view-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
      >
        <div
          className="jp-lesson-meanings-view-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-lesson-meanings-view-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-lesson-meanings-view-header">
            <div>
              <h2 id="jp-lesson-meanings-view-title" className="jp-lesson-meanings-view-title">
                释义
              </h2>
              <p className="jp-lesson-meanings-view-subtitle">#{target.lessonId}</p>
            </div>
            <button
              type="button"
              className="jp-lesson-meanings-view-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-lesson-meanings-view-body">
            {rows.length ? (
              <ul className="jp-lesson-meanings-view-list">
                {rows.map((row) => (
                  <li key={row.label} className="jp-lesson-meanings-view-item">
                    <span className="jp-lesson-meanings-view-word">{row.label}</span>
                    <span className="jp-lesson-meanings-view-text">{row.meaning}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="jp-lesson-meanings-view-empty">暂无释义。</p>
            )}
          </div>

          <div className="jp-lesson-meanings-view-footer">
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
        .jp-lesson-meanings-view-overlay {
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

        .jp-lesson-meanings-view-modal {
          display: flex;
          flex-direction: column;
          width: min(560px, 100%);
          max-height: min(80vh, 560px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-lesson-meanings-view-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-lesson-meanings-view-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-lesson-meanings-view-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--accent);
        }

        .jp-lesson-meanings-view-close {
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

        .jp-lesson-meanings-view-body {
          padding: 1rem 1.15rem;
          overflow-y: auto;
          flex: 1;
          min-height: 6rem;
        }

        .jp-lesson-meanings-view-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .jp-lesson-meanings-view-item {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .jp-lesson-meanings-view-word {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--accent);
          word-break: break-word;
        }

        .jp-lesson-meanings-view-text {
          font-size: 0.875rem;
          line-height: 1.5;
          color: var(--text);
          word-break: break-word;
        }

        .jp-lesson-meanings-view-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .jp-lesson-meanings-view-footer {
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
