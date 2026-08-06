"use client";

import { useCallback, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabConnectionBody } from "@/components/JpVocabConnectionBody";
import { JpVocabContrastDistinctionTable } from "@/components/JpVocabContrastDistinctionTable";
import { JpVocabFuriganaText } from "@/components/JpVocabFuriganaText";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  formatJpVocabExampleGlossLine,
} from "@/lib/jp-vocab-example-sentences";
import {
  buildJpVocabContrastComparisonRows,
  buildJpVocabUsageExamplePairs,
  formatJpVocabUsageExamplesCopyText,
  jpVocabCircledExampleIndex,
  type JpVocabUsageExamplesPairedModel,
} from "@/lib/jp-vocab-usage-examples-display";
import {
  parseJpVocabConnectionDisplayParts,
} from "@/lib/jp-vocab-connection-ai";
import { uniqueJpVocabSourcesForDisplay } from "@/lib/jp-vocab-source-display";
import { JpVocabUsageFrequencyBars } from "@/components/JpVocabUsageFrequencyBars";

type Props = {
  usage: string | null | undefined;
  exampleSentences: string | null | undefined;
  usageSource?: string | null;
  exampleSource?: string | null;
  /** 接序：有编号用法时贴在每条用法下显示「接续：」 */
  connection?: string | null;
  connectionSource?: string | null;
  wordLabel?: string | null;
  /** 读音：对比课抽「なに／なん」「くれる／もらう」形态用 */
  reading?: string | null;
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
  reading,
  model: modelProp,
  emptyText = "暂无用法与例句",
  showCopyAll = false,
}: Props) {
  const model =
    modelProp ??
    buildJpVocabUsageExamplePairs(usage, exampleSentences, {
      word: wordLabel,
      reading,
    });
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

  const contrastRows = buildJpVocabContrastComparisonRows(
    model,
    connectionTextFor,
    { word: wordLabel, reading }
  );
  const showContrastTable = Boolean(contrastRows?.length);
  const contrastConnectionText =
    showContrastTable && connParts.normalized ? connParts.normalized : null;

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

      {showContrastTable && contrastRows ? (
        <JpVocabContrastDistinctionTable rows={contrastRows} />
      ) : model.fallbackUsage ? (
        <p className="jp-usage-ex-paired-fallback">{model.fallbackUsage}</p>
      ) : null}
      {contrastConnectionText ? (
        <JpVocabConnectionBody text={contrastConnectionText} showLabel />
      ) : null}

      {model.pairs.length > 0 ? (
        <ol className="jp-usage-ex-paired-list">
          {model.pairs.map((pair) => {
            const connText =
              showContrastTable || !pair.usageText
                ? null
                : connectionTextFor(pair.index);
            return (
            <li key={pair.index} className="jp-usage-ex-paired-item">
              {pair.usageText && !showContrastTable ? (
                <p className="jp-usage-ex-paired-usage">
                  <span className="jp-usage-ex-paired-usage-label">
                    {pair.usageLabel}：
                  </span>
                  <span className="jp-usage-ex-paired-usage-body">
                    {pair.usageText}
                  </span>
                </p>
              ) : pair.usageText && showContrastTable ? (
                <p className="jp-usage-ex-paired-usage jp-usage-ex-paired-usage--contrast-ex">
                  <span className="jp-usage-ex-paired-usage-label">
                    {pair.usageLabel}的例句
                  </span>
                </p>
              ) : null}
              {!showContrastTable ? (
                <JpVocabUsageFrequencyBars
                  oralFrequency={pair.oralFrequency}
                  examFrequency={pair.examFrequency}
                />
              ) : null}
              {connText ? (
                <JpVocabConnectionBody text={connText} showLabel />
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
        .jp-usage-ex-paired-freq {
          margin: 0.15rem 0 0.35rem;
          font-size: 0.82rem;
          font-weight: 500;
          color: rgba(148, 163, 184, 0.95);
          letter-spacing: 0.01em;
        }
        /* FrequencyBars 自带 jsx global；此处仅保留兼容旧 class，勿再用透明 fill */
        :global(.jp-usage-ex-paired-freq-wrap) {
          display: flex;
          flex-direction: column;
          gap: 0.28rem;
          margin: 0.28rem 0 0.4rem;
          max-width: 100%;
        }
        :global(.jp-usage-ex-paired-freq-row) {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          white-space: nowrap;
          max-width: 100%;
        }
        :global(.jp-usage-ex-paired-freq-caption) {
          flex: 0 0 auto;
          min-width: 4.8em;
          font-size: 0.8rem;
          font-weight: 650;
          letter-spacing: 0.01em;
          color: var(--muted);
        }
        :global(.jp-usage-ex-paired-freq-bar) {
          display: inline-flex;
          align-items: stretch;
          width: 5.5rem;
          height: 0.55rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--muted, #94a3b8) 28%, #0f172a);
          overflow: hidden;
          flex: 0 0 auto;
        }
        :global(.jp-usage-ex-paired-freq-fill) {
          display: block;
          height: 100%;
          min-height: 0.55rem;
          border-radius: inherit;
          background: var(--accent, #3b82f6);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 12%, transparent);
        }
        :global(.jp-usage-ex-paired-freq-score) {
          flex: 0 0 auto;
          font-size: 0.8rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: color-mix(in srgb, var(--accent, #3b82f6) 88%, var(--text, #e2e8f0));
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
        .jp-usage-ex-paired-usage--contrast-ex {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0.35rem;
          margin-bottom: 0.25rem;
          font-size: 1rem;
        }
        .jp-usage-ex-paired-usage--contrast-ex .jp-usage-ex-paired-usage-body {
          font-weight: 500;
          color: var(--muted);
        }
        .jp-usage-ex-paired-jp {
          margin: 0;
          line-height: 1.8;
          color: var(--text);
          font-size: 1.1rem;
        }
        .jp-usage-ex-paired-gloss {
          margin: 0.25rem 0 0;
          line-height: 1.5;
          color: var(--muted);
          font-size: 0.98rem;
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
          line-height: 1.8;
          font-size: 1.05rem;
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
          .jp-usage-ex-paired-jp {
            font-size: 1.15rem;
          }
          .jp-usage-ex-paired-gloss {
            font-size: 1.02rem;
          }
          .jp-usage-ex-paired-nested-index {
            font-size: 1.1rem;
          }
        }
      `}</style>
    </div>
  );
}
