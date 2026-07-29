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
  jpVocabCircledExampleIndex,
  type JpVocabUsageExamplesPairedModel,
} from "@/lib/jp-vocab-usage-examples-display";
import {
  parseJpVocabConnectionDisplayParts,
} from "@/lib/jp-vocab-connection-ai";
import { uniqueJpVocabSourcesForDisplay } from "@/lib/jp-vocab-source-display";

type Props = {
  usage: string | null | undefined;
  exampleSentences: string | null | undefined;
  usageSource?: string | null;
  exampleSource?: string | null;
  /** 接序：有编号用法时贴在每条用法下显示「接续：」 */
  connection?: string | null;
  connectionSource?: string | null;
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
  connection,
  connectionSource,
  wordLabel,
  model: modelProp,
  emptyText = "暂无用法与例句",
  showCopyAll = false,
}: Props) {
  const model =
    modelProp ?? buildJpVocabUsageExamplePairs(usage, exampleSentences);
  const connParts = parseJpVocabConnectionDisplayParts(connection);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyText = formatJpVocabUsageExamplesCopyText(model, wordLabel, {
    connectionByUsageIndex: connParts.byUsageIndex,
    connectionLeftover: connParts.leftover,
    connectionHasUsageTagged: connParts.hasUsageTagged,
  });
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
    exampleSource,
    connectionSource
  );
  const circled = model.useCircledExampleIndex;
  const exampleMark = (n: number) =>
    circled ? jpVocabCircledExampleIndex(n) : `${n}.`;

  const usageIndexesWithText = model.pairs
    .filter((p) => Boolean(p.usageText))
    .map((p) => p.index);
  const firstUsageIndex = usageIndexesWithText[0] ?? null;
  const lastUsageIndex =
    usageIndexesWithText[usageIndexesWithText.length - 1] ?? null;

  const connectionTextFor = (usageIndex: number): string | null => {
    const tagged = connParts.byUsageIndex[usageIndex]?.trim() || "";
    const isFirst = firstUsageIndex === usageIndex;
    const isLast = lastUsageIndex === usageIndex;
    if (connParts.hasUsageTagged) {
      const bits: string[] = [];
      if (tagged) bits.push(tagged);
      if (isLast && connParts.leftover.length) {
        bits.push(...connParts.leftover);
      }
      return bits.length ? bits.join("\n") : null;
    }
    // 无「用法N」标签：整段接序挂在第一条有用法的下面
    if (isFirst && connParts.leftover.length) {
      return connParts.leftover.join("\n");
    }
    return null;
  };

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
          {model.pairs.map((pair) => {
            const connText = pair.usageText
              ? connectionTextFor(pair.index)
              : null;
            return (
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
              {connText ? (
                <p className="jp-usage-ex-paired-connection">
                  <span className="jp-usage-ex-paired-connection-label">
                    接续：
                  </span>
                  <span className="jp-usage-ex-paired-connection-body">
                    {connText}
                  </span>
                </p>
              ) : null}
              {pair.nestedExamples && pair.nestedExamples.length > 0 ? (
                <ol className="jp-usage-ex-paired-nested">
                  {pair.nestedExamples.map((ex, ni) => (
                    <li
                      key={`${pair.index}-n-${ni}`}
                      className="jp-usage-ex-paired-nested-item"
                    >
                      <span
                        className="jp-usage-ex-paired-nested-index"
                        aria-hidden="true"
                      >
                        {exampleMark(ni + 1)}
                      </span>
                      <span className="jp-usage-ex-paired-nested-body">
                        <p className="jp-usage-ex-paired-jp">
                          <JpVocabFuriganaText text={ex.text} />
                        </p>
                        {ex.glossLines.map((gloss, gi) => (
                          <p
                            key={`${pair.index}-n-${ni}-g-${gi}`}
                            className="jp-usage-ex-paired-gloss"
                          >
                            {formatJpVocabExampleGlossLine(gloss)}
                          </p>
                        ))}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : pair.example?.text ? (
                <div className="jp-usage-ex-paired-example-row">
                  {circled || !pair.usageText ? (
                    <span
                      className="jp-usage-ex-paired-nested-index"
                      aria-hidden="true"
                    >
                      {exampleMark(circled && pair.usageText ? 1 : pair.index)}
                    </span>
                  ) : null}
                  <span className="jp-usage-ex-paired-nested-body">
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
                  </span>
                </div>
              ) : pair.usageText ? (
                <p className="jp-usage-ex-paired-example-missing">
                  （暂无对应用例）
                </p>
              ) : null}
            </li>
            );
          })}
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
          margin: 0 0 0.35rem;
          line-height: 1.65;
          color: var(--text);
          font-size: 1.125rem;
        }
        .jp-usage-ex-paired-usage-label {
          font-weight: 600;
        }
        .jp-usage-ex-paired-connection {
          margin: 0 0 0.45rem;
          line-height: 1.55;
          font-size: 0.9375rem;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .jp-usage-ex-paired-connection-label {
          font-weight: 600;
          color: color-mix(in srgb, var(--accent) 75%, var(--muted));
        }
        .jp-usage-ex-paired-connection-body {
          color: var(--muted);
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
        .jp-usage-ex-paired-nested {
          margin: 0.15rem 0 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .jp-usage-ex-paired-nested-item {
          display: flex;
          gap: 0.45rem;
          align-items: flex-start;
          min-width: 0;
        }
        .jp-usage-ex-paired-example-row {
          display: flex;
          gap: 0.45rem;
          align-items: flex-start;
          min-width: 0;
        }
        .jp-usage-ex-paired-nested-index {
          flex: 0 0 auto;
          color: #5b9fd4;
          font-weight: 600;
          line-height: 1.85;
          font-size: 1.15rem;
        }
        .jp-usage-ex-paired-nested-body {
          flex: 1 1 auto;
          min-width: 0;
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
          .jp-usage-ex-paired-connection {
            font-size: 0.98rem;
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
