"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { parseEnVocabClassNoteContent } from "@/lib/en-vocab-class-notes";

type Props = {
  content: string;
  className?: string;
  /** 图片 alt / 放大标题用，默认「备注图片」 */
  imageLabel?: string;
};

export function EnVocabClassNoteContent({
  content,
  className = "",
  imageLabel = "备注图片",
}: Props) {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!zoomSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomSrc]);

  const segments = parseEnVocabClassNoteContent(content);
  if (!segments.length) return null;

  return (
    <>
      <div className={`jp-vocab-note-content ${className}`.trim()}>
        {segments.map((segment, index) => {
          if (segment.type === "text") {
            const text = segment.text.trimEnd();
            if (!text.trim()) return null;
            return (
              <pre key={`text-${index}`} className="jp-vocab-note-content__text">
                {text}
              </pre>
            );
          }
          return (
            <button
              key={`img-${index}-${segment.src}`}
              type="button"
              className="jp-vocab-note-content__image-btn"
              title="点击查看大图"
              onClick={() => setZoomSrc(segment.src)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={segment.src}
                alt={imageLabel}
                className="jp-vocab-note-content__image"
                loading="lazy"
              />
              <span className="jp-vocab-note-content__image-hint">点击放大</span>
            </button>
          );
        })}
      </div>

      {mounted && zoomSrc
        ? createPortal(
            <div
              className="jp-vocab-note-zoom"
              role="dialog"
              aria-modal="true"
              aria-label={`${imageLabel}大图预览`}
              onClick={() => setZoomSrc(null)}
            >
              <div className="jp-vocab-note-zoom__bar">
                <span>
                  {imageLabel} · 点击空白处或按 Esc 关闭
                </span>
                <button
                  type="button"
                  className="jp-vocab-note-zoom__close"
                  onClick={() => setZoomSrc(null)}
                  aria-label="关闭大图预览"
                >
                  ×
                </button>
              </div>
              <div className="jp-vocab-note-zoom__stage">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={zoomSrc}
                  alt={`${imageLabel}大图`}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>,
            document.body
          )
        : null}

      <style jsx>{`
        .jp-vocab-note-content {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.55rem;
          width: 100%;
        }

        .jp-vocab-note-content__text {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font: inherit;
          font-size: 0.9375rem;
          line-height: 1.55;
          color: var(--text);
        }

        .jp-vocab-note-content__image-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 0.55rem;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          cursor: zoom-in;
          overflow: hidden;
        }

        .jp-vocab-note-content__image {
          display: block;
          width: auto;
          max-width: 100%;
          max-height: 320px;
          height: auto;
          object-fit: contain;
          margin: 0 auto;
        }

        .jp-vocab-note-content__image-hint {
          position: absolute;
          right: 0.45rem;
          bottom: 0.4rem;
          padding: 0.12rem 0.4rem;
          border-radius: 4px;
          font-size: 0.6875rem;
          color: rgba(255, 255, 255, 0.92);
          background: rgba(0, 0, 0, 0.52);
          pointer-events: none;
        }

        .jp-vocab-note-zoom {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .jp-vocab-note-zoom__bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.8125rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }

        .jp-vocab-note-zoom__close {
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

        .jp-vocab-note-zoom__stage {
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .jp-vocab-note-zoom__stage :global(img) {
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
