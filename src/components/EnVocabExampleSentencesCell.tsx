"use client";

import { useState } from "react";
import { parseEnVocabExampleSentenceItems } from "@/lib/en-vocab-example-sentences";
import {
  EnVocabExamplesViewModal,
  type EnVocabExamplesViewTarget,
} from "@/components/EnVocabExamplesViewModal";

type Props = {
  text: string | null | undefined;
  source?: string | null;
  /** 弹窗副标题，一般为词条原文 */
  wordLabel?: string | null;
  emptyPlaceholder?: string;
};

export function EnVocabExampleSentencesCell({
  text,
  source,
  wordLabel,
  emptyPlaceholder = "—",
}: Props) {
  const [open, setOpen] = useState(false);
  const items = parseEnVocabExampleSentenceItems(text);

  if (!items.length) {
    return (
      <span className="jp-vocab-example-sentences-empty">{emptyPlaceholder}</span>
    );
  }

  const target: EnVocabExamplesViewTarget = {
    wordLabel,
    text,
    source,
  };

  return (
    <div className="en-vocab-examples-cell">
      <button
        type="button"
        className="en-vocab-examples-view-btn"
        title="查看例句"
        onClick={() => setOpen(true)}
      >
        {`查看 (${items.length})`}
      </button>
      <EnVocabExamplesViewModal
        open={open}
        target={open ? target : null}
        onClose={() => setOpen(false)}
      />
      <style jsx>{`
        .en-vocab-examples-cell {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }
        .en-vocab-examples-view-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 1.75rem;
          max-width: 100%;
          padding: 0.15rem 0.4rem;
          font-size: 0.75rem;
          border-radius: 5px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--accent);
          cursor: pointer;
          font: inherit;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .en-vocab-examples-view-btn:hover {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
      `}</style>
    </div>
  );
}
