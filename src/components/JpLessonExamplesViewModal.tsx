"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  alignLessonItemExampleSentences,
  parseLessonContent,
} from "@/lib/jp-lesson-shared";
import {
  formatJpVocabExampleGlossLine,
  parseJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";

export type JpLessonExamplesViewTarget = {
  lessonId: number;
  content: string;
  exampleSentences: string | null | undefined;
};

type Props = {
  open: boolean;
  target: JpLessonExamplesViewTarget | null;
  onClose: () => void;
};

export function JpLessonExamplesViewModal({ open, target, onClose }: Props) {
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
  const aligned = alignLessonItemExampleSentences(
    target.content,
    target.exampleSentences
  );
  const sections = labels
    .map((label, index) => {
      const block = aligned[index];
      if (!block) return null;
      const sentences = parseJpVocabExampleSentenceItems(block);
      if (!sentences.length) return null;
      return { label, sentences };
    })
    .filter((item): item is { label: string; sentences: ReturnType<typeof parseJpVocabExampleSentenceItems> } =>
      item != null
    );

  return createPortal(
    <>
      <div
        className="jp-lesson-examples-view-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
      >
        <div
          className="jp-lesson-examples-view-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-lesson-examples-view-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-lesson-examples-view-header">
            <div>
              <h2 id="jp-lesson-examples-view-title" className="jp-lesson-examples-view-title">
                例句
              </h2>
              <p className="jp-lesson-examples-view-subtitle">#{target.lessonId}</p>
            </div>
            <button
              type="button"
              className="jp-lesson-examples-view-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-lesson-examples-view-body">
            {sections.length ? (
              <div className="jp-lesson-examples-view-sections">
                {sections.map((section) => (
                  <section key={section.label} className="jp-lesson-examples-view-section">
                    <h3 className="jp-lesson-examples-view-word">{section.label}</h3>
                    <ol className="jp-lesson-examples-view-list">
                      {section.sentences.map((item, idx) => {
                        const gloss = item.glossLines[0]
                          ? formatJpVocabExampleGlossLine(item.glossLines[0])
                          : "";
                        return (
                          <li key={`${section.label}-${idx}`} className="jp-lesson-examples-view-item">
                            <p className="jp-lesson-examples-view-jp">{item.text}</p>
                            {gloss ? (
                              <p className="jp-lesson-examples-view-gloss">{gloss}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            ) : (
              <p className="jp-lesson-examples-view-empty">暂无例句。</p>
            )}
          </div>

          <div className="jp-lesson-examples-view-footer">
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
        .jp-lesson-examples-view-overlay {
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

        .jp-lesson-examples-view-modal {
          display: flex;
          flex-direction: column;
          width: min(640px, 100%);
          max-height: min(80vh, 640px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-lesson-examples-view-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-lesson-examples-view-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-lesson-examples-view-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--accent);
        }

        .jp-lesson-examples-view-close {
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

        .jp-lesson-examples-view-body {
          padding: 1rem 1.15rem;
          overflow-y: auto;
          flex: 1;
          min-height: 8rem;
        }

        .jp-lesson-examples-view-sections {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .jp-lesson-examples-view-section {
          margin: 0;
        }

        .jp-lesson-examples-view-word {
          margin: 0 0 0.45rem;
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--accent);
        }

        .jp-lesson-examples-view-list {
          margin: 0;
          padding: 0 0 0 1.15rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .jp-lesson-examples-view-item {
          margin: 0;
        }

        .jp-lesson-examples-view-jp {
          margin: 0;
          font-size: 0.9375rem;
          line-height: 1.55;
          color: var(--text);
          word-break: break-word;
        }

        .jp-lesson-examples-view-gloss {
          margin: 0.2rem 0 0;
          font-size: 0.8125rem;
          line-height: 1.45;
          color: var(--muted);
          word-break: break-word;
        }

        .jp-lesson-examples-view-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .jp-lesson-examples-view-footer {
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
