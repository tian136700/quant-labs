"use client";

import { buildEnVocabUsageExamplePairs } from "@/lib/en-vocab-usage-examples-display";

type Props = {
  usage: string | null | undefined;
  exampleSentences: string | null | undefined;
  /** 列表省略正文时：usage_present || example_sentences_present */
  contentPresent?: boolean;
  emptyPlaceholder?: string;
  onOpen: () => void;
};

/**
 * 词表「用法 / 例句」合并列：只显示「查看 (N)」按钮，全文在 EnVocabUsageViewModal。
 */
export function EnVocabUsageExamplesCell({
  usage,
  exampleSentences,
  contentPresent = false,
  emptyPlaceholder = "—",
  onOpen,
}: Props) {
  const model = buildEnVocabUsageExamplePairs(usage, exampleSentences);

  if (!model.hasContent && !contentPresent) {
    return (
      <span className="jp-vocab-mnemonic-empty" title="可在「编辑」中填写用法与例句">
        {emptyPlaceholder}
      </span>
    );
  }

  const count = model.pairCount;
  const label =
    model.hasContent && count > 0 ? `查看 (${count})` : "查看";

  return (
    <div className="en-vocab-usage-ex-cell">
      <button
        type="button"
        className="en-vocab-examples-view-btn"
        title="查看用法与例句"
        onClick={onOpen}
      >
        {label}
      </button>
      <style jsx>{`
        .en-vocab-usage-ex-cell {
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
