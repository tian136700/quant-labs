"use client";

import { useCallback, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabFuriganaText } from "@/components/JpVocabFuriganaText";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  formatJpVocabExampleGlossLine,
} from "@/lib/jp-vocab-example-sentences";
import {
  buildJpVocabUsageExamplePairs,
  formatJpVocabUsageExamplesCopyText,
  type JpVocabUsageExamplesPairedModel,
} from "@/lib/jp-vocab-usage-examples-display";
import { uniqueJpVocabSourcesForDisplay } from "@/lib/jp-vocab-source-display";

type Props = {
  usage: string | null | undefined;
  exampleSentences: string | null | undefined;
  usageSource?: string | null;
  exampleSource?: string | null;
  wordLabel?: string | null;
  model?: JpVocabUsageExamplesPairedModel;
  emptyText?: string;
  /** 标题旁是否显示复制全部 */
  showCopyAll?: boolean;
};

export function JpVocabUsageExamplesPairedContent({
  usage,
  exampleSentences,
  usageSource,
  exampleSource,
  wordLabel,
  model: modelProp,
  emptyText = "暂无用法与例句",
  showCopyAll = false,
}: Props) {
  const model =
    modelProp ?? buildJpVocabUsageExamplePairs(usage, exampleSentences);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyText = formatJpVocabUsageExamplesCopyText(model, wordLabel);
  const onCopy = useCallback(() => {
    if (!copyText) return;
    void copyTextToClipboard(copyText).then((ok) =>
      setCopyToast(ok ? "复制成功" : "复制失败")
    );
  }, [copyText]);

  if (!model.hasContent) {
    return <p className="jp-usage-ex-paired-empty">{emptyText}</p>;
  }

  const sourceLabels = uniqueJpVocabSourcesForDisplay(
    usageSource,
    exampleSource
  );

  return (
    <div className="jp-usage-ex-paired">
      {showCopyAll && copyText ? (
        <div className="jp-usage-ex-paired-toolbar">
          <button
            type="button"
            className="jp-vocab-flashcard-copy-btn jp-vocab-example-sentences-copy-all-btn"
            title="复制全部用法与例句（含译文）"
            aria-label="复制全部用法与例句（含译文）"
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
          >
            复制全部
          </button>
        </div>
      ) : null}

      {model.fallbackUsage ? (
        <p className="jp-usage-ex-paired-fallback">{model.fallbackUsage}</p>
      ) : null}

      {model.pairs.length > 0 ? (
        <ol className="jp-usage-ex-paired-list">
          {model.pairs.map((pair) => (
            <li key={pair.index} className="jp-usage-ex-paired-item">
              {pair.usageText ? (
                <p className="jp-usage-ex-paired-usage">
                  <span className="jp-usage-ex-paired-usage-label">
                    {pair.usageLabel}：
                  </span>
                  <span className="jp-usage-ex-paired-usage-body">
                    {pair.usageText}
                  </span>
                </p>
              ) : null}
              {pair.example?.text ? (
                <>
                  <p className="jp-usage-ex-paired-jp">
                    <JpVocabFuriganaText text={pair.example.text} />
                  </p>
                  {pair.example.glossLines.map((gloss, gi) => (
                    <p
                      key={`${pair.index}-g-${gi}`}
                      className="jp-usage-ex-paired-gloss"
                    >
                      {formatJpVocabExampleGlossLine(gloss)}
                    </p>
                  ))}
                </>
              ) : pair.usageText ? (
                <p className="jp-usage-ex-paired-example-missing">
                  （暂无对应用例）
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {sourceLabels.length > 0 ? (
        <div className="jp-usage-ex-paired-sources">
          {sourceLabels.map((src) => (
            <JpVocabSourceLabel key={src} source={src} />
          ))}
        </div>
      ) : null}

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />

      <style jsx>{`
        .jp-usage-ex-paired {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          min-width: 0;
        }
        .jp-usage-ex-paired-toolbar {
          display: flex;
          justify-content: flex-end;
        }
        .jp-usage-ex-paired-empty {
          margin: 0;
          color: var(--muted);
          font-size: 1.05rem;
        }
        .jp-usage-ex-paired-fallback {
          margin: 0;
          white-space: pre-wrap;
          line-height: 1.65;
          color: var(--text);
          font-size: 1.125rem;
        }
        .jp-usage-ex-paired-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .jp-usage-ex-paired-item {
          margin: 0;
          padding: 0;
          min-width: 0;
        }
        .jp-usage-ex-paired-usage {
          margin: 0 0 0.4rem;
          line-height: 1.65;
          color: var(--text);
          font-size: 1.125rem;
        }
        .jp-usage-ex-paired-usage-label {
          font-weight: 600;
        }
        .jp-usage-ex-paired-jp {
          margin: 0;
          line-height: 1.85;
          color: var(--text);
          font-size: 1.2rem;
        }
        .jp-usage-ex-paired-gloss {
          margin: 0.25rem 0 0;
          line-height: 1.55;
          color: var(--muted);
          font-size: 1.05rem;
        }
        .jp-usage-ex-paired-example-missing {
          margin: 0.2rem 0 0;
          color: var(--muted);
          font-size: 0.95rem;
        }
        .jp-usage-ex-paired-sources {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.15rem;
        }
        @media (max-width: 767px) {
          .jp-usage-ex-paired-usage,
          .jp-usage-ex-paired-fallback {
            font-size: 1.15rem;
          }
          .jp-usage-ex-paired-jp {
            font-size: 1.25rem;
          }
          .jp-usage-ex-paired-gloss {
            font-size: 1.1rem;
          }
        }
      `}</style>
    </div>
  );
}
