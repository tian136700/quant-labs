"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  resolveJpVocabMobileNotesPreview,
  type JpVocabMobileNotesPreview,
} from "@/lib/jp-vocab-class-notes";

type Props = {
  classNotes: string | null | undefined;
  hasNotes: boolean;
  canOperate: boolean;
  onView: () => void;
  onEdit: () => void;
};

function NotesZoomOverlay({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="jp-vocab-mobile-notes-zoom"
      role="dialog"
      aria-modal="true"
      aria-label="备注图片大图预览"
      onClick={onClose}
    >
      <div className="jp-vocab-mobile-notes-zoom__bar">
        <span>备注图片 · 点击空白处或按 Esc 关闭</span>
        <button
          type="button"
          className="jp-vocab-mobile-notes-zoom__close"
          onClick={onClose}
          aria-label="关闭大图预览"
        >
          ×
        </button>
      </div>
      <div className="jp-vocab-mobile-notes-zoom__stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="备注图片大图" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>,
    document.body
  );
}

function renderImageBlock(src: string, onZoom: (src: string) => void) {
  return (
    <div className="jp-vocab-mobile-notes-image-block">
      <button
        type="button"
        className="jp-vocab-mobile-notes-thumb"
        title="点击查看大图"
        aria-label="点击查看备注大图"
        onClick={() => onZoom(src)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="备注图片" loading="lazy" />
      </button>
      <p className="jp-vocab-mobile-notes-image-hint">点击图片可放大</p>
    </div>
  );
}

function renderInlinePreview(
  preview: JpVocabMobileNotesPreview,
  onZoom: (src: string) => void
) {
  if (preview.kind === "short-text") {
    return <p className="jp-vocab-mobile-notes-snippet">{preview.text}</p>;
  }

  if (preview.kind === "image-only") {
    return renderImageBlock(preview.src, onZoom);
  }

  if (preview.kind === "short-mixed") {
    return (
      <>
        <p className="jp-vocab-mobile-notes-snippet">{preview.text}</p>
        {renderImageBlock(preview.src, onZoom)}
      </>
    );
  }

  if (preview.kind === "long") {
    return (
      <p className="jp-vocab-mobile-notes-long-hint">内容较长，点「查看」阅读完整备注</p>
    );
  }

  return null;
}

export function JpVocabMobileNotesCell({
  classNotes,
  hasNotes,
  canOperate,
  onView,
  onEdit,
}: Props) {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const preview = resolveJpVocabMobileNotesPreview(classNotes);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showContent =
    preview.kind === "short-text" ||
    preview.kind === "image-only" ||
    preview.kind === "short-mixed" ||
    preview.kind === "long";

  return (
    <>
      <div className="jp-vocab-mobile-notes jp-vocab-mobile-only">
        <div className="jp-vocab-mobile-notes-head">
          <span className="jp-vocab-mobile-notes-label">
            备注<span className="jp-vocab-mobile-notes-ellipsis">..</span>
          </span>
          <div className="jp-vocab-mobile-notes-actions">
            {hasNotes ? (
              <button
                type="button"
                className="jp-vocab-mobile-notes-chip"
                title="查看备注"
                onClick={onView}
              >
                查看
              </button>
            ) : null}
            {canOperate ? (
              <button
                type="button"
                className="jp-vocab-mobile-notes-chip jp-vocab-mobile-notes-chip--edit"
                title="编辑备注"
                aria-label="编辑备注"
                onClick={onEdit}
              >
                <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                  <path
                    d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
        {showContent ? renderInlinePreview(preview, setZoomSrc) : null}
      </div>

      {mounted && zoomSrc ? (
        <NotesZoomOverlay src={zoomSrc} onClose={() => setZoomSrc(null)} />
      ) : null}

      <style jsx>{`
        .jp-vocab-mobile-notes {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.35rem;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .jp-vocab-mobile-notes-head {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          flex-wrap: wrap;
          gap: 0.35rem 0.5rem;
          min-width: 0;
          width: 100%;
        }

        .jp-vocab-mobile-notes-label {
          flex: 0 0 auto;
          font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
          font-weight: 500;
          color: var(--muted);
          line-height: 1.3;
        }

        .jp-vocab-mobile-notes-ellipsis {
          letter-spacing: 0.02em;
        }

        .jp-vocab-mobile-notes-actions {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.3rem;
          min-width: 0;
          max-width: 100%;
        }

        .jp-vocab-mobile-notes-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          min-width: 0;
          height: 1.5rem;
          padding: 0 0.45rem;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
          color: var(--text);
          font: inherit;
          font-size: 0.6875rem;
          line-height: 1;
          cursor: pointer;
          white-space: nowrap;
        }

        .jp-vocab-mobile-notes-chip--edit {
          width: 1.5rem;
          padding: 0;
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }

        .jp-vocab-mobile-notes-snippet {
          margin: 0;
          font-size: clamp(0.6875rem, 2.6vw, 0.75rem);
          line-height: 1.45;
          color: color-mix(in srgb, var(--text) 88%, var(--muted));
          white-space: pre-wrap;
          word-break: break-word;
          max-width: 100%;
        }

        .jp-vocab-mobile-notes-long-hint {
          margin: 0;
          font-size: clamp(0.6875rem, 2.6vw, 0.75rem);
          line-height: 1.4;
          color: var(--muted);
        }

        .jp-vocab-mobile-notes-image-block {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
          max-width: 100%;
          min-width: 0;
        }

        .jp-vocab-mobile-notes-thumb {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 3rem;
          height: 3rem;
          padding: 0.12rem;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          cursor: zoom-in;
          overflow: hidden;
        }

        .jp-vocab-mobile-notes-thumb :global(img) {
          display: block;
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          object-fit: cover;
        }

        .jp-vocab-mobile-notes-image-hint {
          margin: 0;
          font-size: clamp(0.625rem, 2.4vw, 0.6875rem);
          line-height: 1.35;
          color: var(--muted);
        }
      `}</style>
      <style jsx global>{`
        .jp-vocab-mobile-notes-zoom {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .jp-vocab-mobile-notes-zoom__bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
          color: var(--muted);
          font-size: 0.8125rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }

        .jp-vocab-mobile-notes-zoom__close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-vocab-mobile-notes-zoom__stage {
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
        }

        .jp-vocab-mobile-notes-zoom__stage img {
          display: block;
          max-width: min(100%, 1200px);
          width: auto;
          height: auto;
          object-fit: contain;
        }

        @media (max-width: 767px) {
          .jp-vocab-table .jp-vocab-notes-col .jp-vocab-mobile-notes {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            box-sizing: border-box;
          }

          .jp-vocab-table .jp-vocab-notes-col .jp-vocab-notes-actions,
          .jp-vocab-table .jp-vocab-notes-col .jp-vocab-mobile-action-btn,
          .jp-vocab-table .jp-vocab-notes-col .jp-vocab-notes-edit-btn {
            width: auto !important;
            min-height: 0 !important;
          }
        }
      `}</style>
    </>
  );
}
