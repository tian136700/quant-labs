"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JpEditIconButton } from "@/components/JpEditIconButton";
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

function renderInlinePreview(
  preview: JpVocabMobileNotesPreview,
  onZoom: (src: string) => void
) {
  if (preview.kind === "short-text") {
    return <p className="jp-vocab-mobile-notes-snippet">{preview.text}</p>;
  }

  if (preview.kind === "image-only") {
    return (
      <div className="jp-vocab-mobile-notes-image-row">
        <button
          type="button"
          className="jp-vocab-mobile-notes-thumb"
          title="点击查看大图"
          aria-label="点击查看备注大图"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onZoom(preview.src);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.src} alt="备注图片" loading="lazy" />
        </button>
        <span className="jp-vocab-mobile-notes-image-hint">点击图片可放大</span>
      </div>
    );
  }

  if (preview.kind === "short-mixed") {
    return (
      <>
        <p className="jp-vocab-mobile-notes-snippet">{preview.text}</p>
        <div className="jp-vocab-mobile-notes-image-row">
          <button
            type="button"
            className="jp-vocab-mobile-notes-thumb"
            title="点击查看大图"
            aria-label="点击查看备注大图"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onZoom(preview.src);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.src} alt="备注图片" loading="lazy" />
          </button>
          <span className="jp-vocab-mobile-notes-image-hint">点击图片可放大</span>
        </div>
      </>
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
  const showInline =
    preview.kind === "short-text" ||
    preview.kind === "image-only" ||
    preview.kind === "short-mixed";

  useEffect(() => {
    setMounted(true);
  }, []);

  const renderActions = () => (
    <div className="jp-vocab-notes-actions">
      {hasNotes ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-notes-view-btn"
          title="查看备注"
          onClick={onView}
        >
          查看
        </button>
      ) : null}
      {canOperate ? (
        <JpEditIconButton
          title="编辑备注"
          className="jp-vocab-notes-edit-btn"
          onClick={onEdit}
        />
      ) : null}
    </div>
  );

  if (showInline) {
    return (
      <>
        <div className="jp-vocab-mobile-notes-inline jp-vocab-mobile-only">
          <div className="jp-vocab-mobile-notes-inline-head">
            <span className="jp-vocab-mobile-notes-label">
              备注<span className="jp-vocab-mobile-notes-ellipsis">..</span>
            </span>
            {renderActions()}
          </div>
          {renderInlinePreview(preview, setZoomSrc)}
        </div>
        {mounted && zoomSrc ? (
          <NotesZoomOverlay src={zoomSrc} onClose={() => setZoomSrc(null)} />
        ) : null}
        <style jsx>{`
          .jp-vocab-mobile-notes-inline {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 0.3rem;
            width: 100%;
          }

          .jp-vocab-mobile-notes-inline-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            min-height: 2rem;
          }

          .jp-vocab-mobile-notes-label {
            font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
            font-weight: 500;
            color: var(--muted);
            flex-shrink: 0;
          }

          .jp-vocab-mobile-notes-ellipsis {
            letter-spacing: 0.02em;
          }

          .jp-vocab-mobile-notes-inline :global(.jp-vocab-notes-actions) {
            margin-left: auto;
            flex-shrink: 0;
            gap: 0.35rem;
          }

          .jp-vocab-mobile-notes-snippet {
            margin: 0;
            font-size: clamp(0.6875rem, 2.6vw, 0.75rem);
            line-height: 1.45;
            color: color-mix(in srgb, var(--text) 88%, var(--muted));
            white-space: pre-wrap;
            word-break: break-word;
          }

          .jp-vocab-mobile-notes-image-row {
            display: flex;
            align-items: center;
            gap: 0.45rem;
            min-width: 0;
          }

          .jp-vocab-mobile-notes-thumb {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 2.75rem;
            height: 2.75rem;
            padding: 0.15rem;
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
            object-fit: cover;
          }

          .jp-vocab-mobile-notes-image-hint {
            font-size: clamp(0.6875rem, 2.6vw, 0.75rem);
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
        `}</style>
      </>
    );
  }

  return (
    <details className="jp-vocab-notes-fold jp-vocab-mobile-only">
      <summary className="jp-vocab-notes-fold__summary">
        <span className="jp-vocab-fold-label">
          备注<span className="jp-vocab-mobile-notes-ellipsis">..</span>
        </span>
        <span className="jp-vocab-notes-fold__hint">
          {hasNotes ? "查看 ›" : canOperate ? "编辑 ›" : "—"}
        </span>
      </summary>
      {renderActions()}
      <style jsx>{`
        .jp-vocab-mobile-notes-ellipsis {
          letter-spacing: 0.02em;
        }
      `}</style>
    </details>
  );
}
