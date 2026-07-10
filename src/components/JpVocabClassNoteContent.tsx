"use client";

import { parseJpVocabClassNoteContent } from "@/lib/jp-vocab-class-notes";

type Props = {
  content: string;
  className?: string;
};

export function JpVocabClassNoteContent({ content, className = "" }: Props) {
  const segments = parseJpVocabClassNoteContent(content);
  if (!segments.length) return null;

  return (
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
            onClick={() => window.open(segment.src, "_blank", "noopener,noreferrer")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={segment.src}
              alt="备注图片"
              className="jp-vocab-note-content__image"
              loading="lazy"
            />
          </button>
        );
      })}

      <style jsx>{`
        .jp-vocab-note-content {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
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
          display: block;
          padding: 0;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          cursor: zoom-in;
          overflow: hidden;
          max-width: 100%;
        }

        .jp-vocab-note-content__image {
          display: block;
          max-width: min(100%, 420px);
          max-height: 280px;
          width: auto;
          height: auto;
          object-fit: contain;
        }
      `}</style>
    </div>
  );
}
