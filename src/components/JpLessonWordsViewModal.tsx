"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  alignLessonItemMeanings,
  jpLessonKindLabel,
  parseLessonContent,
} from "@/lib/jp-lesson-shared";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import type { JpLessonRecord } from "@/lib/types";

type Props = {
  open: boolean;
  lesson: JpLessonRecord | null;
  onClose: () => void;
};

/**
 * 无教案时「查看」：竖排 1. 2. 3. … 展示本课学习内容（及对齐释义）。
 */
export function JpLessonWordsViewModal({ open, lesson, onClose }: Props) {
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

  if (!open || !mounted || !lesson) return null;

  const items = parseLessonContent(lesson.content);
  const meanings = alignLessonItemMeanings(lesson.content, lesson.meanings);
  const rows = items.length
    ? items.map((word, index) => ({
        word,
        meaning: meanings[index] || null,
      }))
    : lesson.content.trim()
      ? [{ word: lesson.content.trim(), meaning: null }]
      : [];

  const subtitleBits = [
    `#${lesson.id}`,
    jpLessonKindLabel(lesson.kind),
    lesson.course_label || null,
  ].filter(Boolean);

  return createPortal(
    <div
      className="jp-lesson-words-view-overlay"
      role="presentation"
      onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
    >
      <div
        className="jp-lesson-words-view-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-words-view-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-words-view-header">
          <div>
            <h2 id="jp-lesson-words-view-title" className="jp-lesson-words-view-title">
              学习内容
            </h2>
            <p className="jp-lesson-words-view-subtitle">{subtitleBits.join(" · ")}</p>
          </div>
          <button
            type="button"
            className="jp-lesson-words-view-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="jp-lesson-words-view-body">
          {rows.length ? (
            <ol className="jp-lesson-words-view-list">
              {rows.map((row, index) => (
                <li key={`${index}-${row.word}`} className="jp-lesson-words-view-item">
                  <span className="jp-lesson-words-view-index" aria-hidden="true">
                    {index + 1}.
                  </span>
                  <div className="jp-lesson-words-view-main">
                    <span className="jp-lesson-words-view-word">{row.word}</span>
                    {row.meaning ? (
                      <span className="jp-lesson-words-view-meaning">{row.meaning}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="jp-lesson-words-view-empty">暂无学习内容</p>
          )}
        </div>
      </div>

      <style jsx>{`
        .jp-lesson-words-view-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
        }
        .jp-lesson-words-view-modal {
          display: flex;
          flex-direction: column;
          width: min(520px, 100%);
          max-height: min(calc(100dvh - 2rem), 820px);
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-lesson-words-view-header {
          flex-shrink: 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.7rem;
          border-bottom: 1px solid var(--border);
        }
        .jp-lesson-words-view-title {
          margin: 0;
          font-size: 1.1rem;
        }
        .jp-lesson-words-view-subtitle {
          margin: 0.3rem 0 0;
          color: var(--muted);
          font-size: 0.85rem;
          line-height: 1.4;
        }
        .jp-lesson-words-view-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: transparent;
          color: var(--text);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }
        .jp-lesson-words-view-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 0.85rem 1.1rem 1.1rem;
        }
        .jp-lesson-words-view-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .jp-lesson-words-view-item {
          display: flex;
          align-items: flex-start;
          gap: 0.45rem;
          padding: 0.45rem 0.55rem;
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 70%, var(--panel));
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }
        .jp-lesson-words-view-index {
          flex-shrink: 0;
          min-width: 1.6rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          line-height: 1.45;
        }
        .jp-lesson-words-view-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .jp-lesson-words-view-word {
          font-size: 1.05rem;
          font-weight: 600;
          line-height: 1.45;
          word-break: break-word;
        }
        .jp-lesson-words-view-meaning {
          color: var(--muted);
          font-size: 0.9rem;
          line-height: 1.4;
          word-break: break-word;
        }
        .jp-lesson-words-view-empty {
          margin: 0;
          color: var(--muted);
          font-size: 0.9rem;
        }
        @media (max-width: 767px) {
          .jp-lesson-words-view-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-lesson-words-view-modal {
            width: 100%;
            max-height: min(92dvh, 820px);
            border-radius: 14px 14px 0 0;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
