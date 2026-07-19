"use client";

import { useState } from "react";
import {
  formatEnVocabExampleGlossLine,
  parseEnVocabExampleSentenceItems,
} from "@/lib/en-vocab-example-sentences";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";

type Props = {
  text: string | null | undefined;
  source?: string | null;
  emptyPlaceholder?: string;
};

export function EnVocabExampleSentencesCell({
  text,
  source,
  emptyPlaceholder = "—",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const items = parseEnVocabExampleSentenceItems(text);

  if (!items.length) {
    return (
      <span className="jp-vocab-example-sentences-empty">{emptyPlaceholder}</span>
    );
  }

  return (
    <div
      className="en-vocab-examples-cell"
      data-expanded={expanded ? "true" : undefined}
    >
      <button
        type="button"
        className="en-vocab-examples-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "收起" : `展开 (${items.length})`}
      </button>
      {expanded ? (
        <div className="jp-vocab-example-sentences jp-vocab-example-sentences--with-source">
          {items.map((item, index) => (
            <div key={index} className="jp-vocab-example-sentences-block">
              <div className="jp-vocab-example-sentences-line">
                <span className="jp-vocab-example-sentences-index">{index + 1}. </span>
                <span>{item.text}</span>
              </div>
              {item.gloss ? (
                <div className="jp-vocab-example-sentences-line jp-vocab-example-sentences-line--gloss">
                  {formatEnVocabExampleGlossLine(item.gloss)}
                </div>
              ) : null}
            </div>
          ))}
          <JpVocabSourceLabel source={source} />
        </div>
      ) : null}
      <style jsx>{`
        .en-vocab-examples-cell {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.4rem;
          min-width: 0;
        }
        .en-vocab-examples-cell[data-expanded="true"] {
          max-width: 22rem;
        }
        .en-vocab-examples-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 1.75rem;
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
        }
        .en-vocab-examples-toggle:hover {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
      `}</style>
    </div>
  );
}
