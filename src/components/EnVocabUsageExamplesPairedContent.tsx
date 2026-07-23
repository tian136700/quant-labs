"use client";

import { EnVocabClassNoteContent } from "@/components/EnVocabClassNoteContent";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import {
  formatEnVocabExampleGlossLine,
  stripEnVocabExampleGlossLabel,
} from "@/lib/en-vocab-example-sentences";
import {
  buildEnVocabUsageExamplePairs,
  type EnVocabUsageExamplesPairedModel,
} from "@/lib/en-vocab-usage-examples-display";

type Props = {
  usage: string | null | undefined;
  exampleSentences: string | null | undefined;
  usageSource?: string | null;
  exampleSource?: string | null;
  /** 外层已算好时可传入，避免重复解析 */
  model?: EnVocabUsageExamplesPairedModel;
  emptyText?: string;
  className?: string;
};

export function EnVocabUsageExamplesPairedContent({
  usage,
  exampleSentences,
  usageSource,
  exampleSource,
  model: modelProp,
  emptyText = "暂无用法与例句",
  className,
}: Props) {
  const model = modelProp ?? buildEnVocabUsageExamplePairs(usage, exampleSentences);

  if (!model.hasContent) {
    return <p className="en-usage-ex-paired-empty">{emptyText}</p>;
  }

  const imageBlock =
    model.imageLines.length > 0 ? model.imageLines.join("\n") : "";

  return (
    <div className={`en-usage-ex-paired${className ? ` ${className}` : ""}`}>
      {model.fallbackUsage ? (
        <div className="en-usage-ex-paired-fallback">
          <EnVocabClassNoteContent
            content={model.fallbackUsage}
            imageLabel="用法图片"
          />
        </div>
      ) : null}

      {model.pairs.length > 0 ? (
        <ol className="en-usage-ex-paired-list">
          {model.pairs.map((pair) => {
            const glossRaw = pair.example?.gloss
              ? stripEnVocabExampleGlossLabel(pair.example.gloss)
              : "";
            const glossLine = glossRaw
              ? formatEnVocabExampleGlossLine(glossRaw)
              : "";
            return (
              <li key={pair.index} className="en-usage-ex-paired-item">
                {pair.usageText ? (
                  <p className="en-usage-ex-paired-usage">
                    <span className="en-usage-ex-paired-usage-label">
                      {pair.usageLabel}：
                    </span>
                    <span className="en-usage-ex-paired-usage-body">
                      {pair.usageText}
                    </span>
                  </p>
                ) : null}
                {pair.example?.text ? (
                  <>
                    <p className="en-usage-ex-paired-en">{pair.example.text}</p>
                    {glossLine ? (
                      <p className="en-usage-ex-paired-gloss">{glossLine}</p>
                    ) : null}
                  </>
                ) : pair.usageText ? (
                  <p className="en-usage-ex-paired-example-missing">（暂无对应用例）</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {imageBlock ? (
        <div className="en-usage-ex-paired-images">
          <EnVocabClassNoteContent content={imageBlock} imageLabel="用法图片" />
        </div>
      ) : null}

      <div className="en-usage-ex-paired-sources">
        {usageSource?.trim() ? (
          <JpVocabSourceLabel source={usageSource} />
        ) : null}
        {exampleSource?.trim() ? (
          <JpVocabSourceLabel source={exampleSource} />
        ) : null}
      </div>

      <style jsx>{`
        .en-usage-ex-paired {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          min-width: 0;
        }
        .en-usage-ex-paired-empty {
          margin: 0;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .en-usage-ex-paired-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .en-usage-ex-paired-item {
          margin: 0;
          padding: 0;
          min-width: 0;
        }
        .en-usage-ex-paired-usage {
          margin: 0 0 0.35rem;
          line-height: 1.5;
          color: var(--text);
          font-size: 0.95rem;
        }
        .en-usage-ex-paired-usage-label {
          font-weight: 600;
          color: var(--text);
        }
        .en-usage-ex-paired-usage-body {
          font-weight: 400;
        }
        .en-usage-ex-paired-en {
          margin: 0;
          line-height: 1.5;
          color: var(--text);
          font-size: 0.95rem;
        }
        .en-usage-ex-paired-gloss {
          margin: 0.2rem 0 0;
          line-height: 1.45;
          color: var(--muted);
          font-size: 0.875rem;
        }
        .en-usage-ex-paired-example-missing {
          margin: 0.15rem 0 0;
          color: var(--muted);
          font-size: 0.8rem;
        }
        .en-usage-ex-paired-sources {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.15rem;
        }
      `}</style>
    </div>
  );
}
