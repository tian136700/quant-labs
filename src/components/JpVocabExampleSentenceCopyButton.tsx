"use client";

import { useCallback, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  jpVocabExampleSentencesCopyText,
  type JpVocabExampleSentenceItem,
} from "@/lib/jp-vocab-example-sentences";

type Props = {
  items: readonly JpVocabExampleSentenceItem[];
};

/** 例句区标题旁：一键复制全部例句（含译文） */
export function JpVocabExampleSentenceCopyButton({ items }: Props) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const text = jpVocabExampleSentencesCopyText(items);
  const onCopied = useCallback((message: string) => setCopyToast(message), []);

  if (!text) return null;

  return (
    <>
      <button
        type="button"
        className="jp-vocab-flashcard-copy-btn jp-vocab-example-sentences-copy-all-btn"
        title="复制全部例句（含译文）"
        aria-label="复制全部例句（含译文）"
        onClick={(e) => {
          e.stopPropagation();
          void copyTextToClipboard(text).then((ok) =>
            onCopied(ok ? "已复制全部例句" : "复制失败")
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
        <span>复制全部</span>
      </button>

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
      />

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
        @media (max-width: 1024px) {
          .jp-vocab-flashcard-copy-btn {
            min-height: 2.75rem;
            padding: 0.4rem 0.65rem;
            font-size: 0.8125rem;
            touch-action: manipulation;
          }
        }
      `}</style>
    </>
  );
}
