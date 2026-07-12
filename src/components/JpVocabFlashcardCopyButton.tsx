"use client";

import { copyTextToClipboard } from "@/lib/copy-text";
import { jpVocabFlashcardCopyText } from "@/lib/jp-vocab-flashcard-copy";

type Props = {
  readingTrim: string;
  wordTrim: string;
  onCopied: (message: string) => void;
};

export function JpVocabFlashcardCopyButton({
  readingTrim,
  wordTrim,
  onCopied,
}: Props) {
  const text = jpVocabFlashcardCopyText(readingTrim, wordTrim);
  if (!text) return null;

  return (
    <>
      <button
        type="button"
        className="jp-vocab-flashcard-copy-btn"
        title={`复制「${text}」`}
        aria-label={`复制「${text}」`}
        onClick={(e) => {
          e.stopPropagation();
          void copyTextToClipboard(text).then((ok) =>
            onCopied(ok ? "已复制" : "复制失败")
          );
        }}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <rect
            x="7"
            y="7"
            width="9"
            height="9"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M5 13H4.5A1.5 1.5 0 0 1 3 11.5v-8A1.5 1.5 0 0 1 4.5 2h8A1.5 1.5 0 0 1 14 3.5V4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <span>复制</span>
      </button>

      <style jsx global>{`
        .jp-vocab-flashcard-copy-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
          padding: 0.2rem 0.45rem;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 70%, var(--panel));
          color: var(--muted);
          font-size: 0.6875rem;
          font-weight: 500;
          line-height: 1;
          cursor: pointer;
        }
        .jp-vocab-flashcard-copy-btn:hover {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }
        @media (max-width: 768px) {
          .jp-vocab-flashcard-copy-btn {
            min-height: 1.75rem;
            padding: 0.3rem 0.5rem;
            font-size: 0.75rem;
          }
        }
      `}</style>
    </>
  );
}
