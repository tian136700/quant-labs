"use client";

import { EnVocabClassNoteContent } from "@/components/EnVocabClassNoteContent";
import { EnVocabSpeakButton } from "@/components/EnVocabSpeakButton";
import { JpVocabConnectionBody } from "@/components/JpVocabConnectionBody";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { JpVocabUsageFrequencyBars } from "@/components/JpVocabUsageFrequencyBars";
import {
  formatEnVocabExampleGlossLine,
  stripEnVocabExampleGlossLabel,
} from "@/lib/en-vocab-example-sentences";
import {
  buildEnVocabUsageExamplePairs,
  type EnVocabUsageExamplesPairedModel,
} from "@/lib/en-vocab-usage-examples-display";
import { parseJpVocabConnectionDisplayParts } from "@/lib/jp-vocab-connection-ai";
import { uniqueJpVocabSourcesForDisplay } from "@/lib/jp-vocab-source-display";
import type { EnVocabLevel } from "@/lib/types";

const LEVELS: { key: EnVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

export type EnVocabUsageLevelControls = {
  /** 与编号用法条数对齐；未勾为 null/undefined */
  levels: Array<EnVocabLevel | null | undefined>;
  disabled?: boolean;
  /** disabled 时按钮 title（如已共享不可改） */
  disabledReason?: string;
  onSelect: (usageIndex: number, level: EnVocabLevel) => void;
};

type Props = {
  usage: string | null | undefined;
  exampleSentences: string | null | undefined;
  usageSource?: string | null;
  exampleSource?: string | null;
  /** 接序：有编号用法时贴在每条用法下显示「接续：」（对齐日语） */
  connection?: string | null;
  connectionSource?: string | null;
  /** 外层已算好时可传入，避免重复解析 */
  model?: EnVocabUsageExamplesPairedModel;
  emptyText?: string;
  className?: string;
  /** 抽查卡：每条用法旁熟悉程度（有编号用法时） */
  usageLevelControls?: EnVocabUsageLevelControls | null;
};

export function EnVocabUsageExamplesPairedContent({
  usage,
  exampleSentences,
  usageSource,
  exampleSource,
  connection,
  connectionSource,
  model: modelProp,
  emptyText = "暂无用法与例句",
  className,
  usageLevelControls = null,
}: Props) {
  const model = modelProp ?? buildEnVocabUsageExamplePairs(usage, exampleSentences);
  const connParts = parseJpVocabConnectionDisplayParts(connection);
  const hasConnection = Boolean(connParts.normalized);

  if (!model.hasContent && !hasConnection) {
    return <p className="en-usage-ex-paired-empty">{emptyText}</p>;
  }

  const imageBlock =
    model.imageLines.length > 0 ? model.imageLines.join("\n") : "";
  // 用法 / 例句 / 接序同源（含展示规范化后相同）只角标一次
  const sourceLabels = uniqueJpVocabSourcesForDisplay(
    usageSource,
    exampleSource,
    connectionSource
  );

  const usageIndexesWithText = model.pairs
    .filter((p) => Boolean(p.usageText))
    .map((p) => p.index);
  const firstUsageIndex = usageIndexesWithText[0] ?? null;

  const connectionTextFor = (usageIndex: number): string | null => {
    const tagged = connParts.byUsageIndex[usageIndex]?.trim() || "";
    // 注意/否定形等 leftover 不要并进公式正文：其内「；」会打断接续表解析
    if (connParts.hasUsageTagged) {
      return tagged || null;
    }
    if (firstUsageIndex === usageIndex && connParts.leftover.length) {
      return connParts.leftover.join("\n");
    }
    return null;
  };
  const leftoverConnectionNotes =
    connParts.hasUsageTagged && connParts.leftover.length
      ? connParts.leftover.join("\n")
      : "";

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

      {/* 无编号用法时：接序单独一块 */}
      {!usageIndexesWithText.length && connParts.normalized ? (
        <JpVocabConnectionBody text={connParts.normalized} showLabel />
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
            const usageIndex = pair.index - 1;
            const showLevel =
              usageLevelControls != null && Boolean(pair.usageText);
            const selectedLevel = showLevel
              ? usageLevelControls.levels[usageIndex] ?? null
              : null;
            const connText = pair.usageText
              ? connectionTextFor(pair.index)
              : null;
            return (
              <li
                key={pair.index}
                className="en-usage-ex-paired-item"
                data-en-usage-level-index={showLevel ? usageIndex : undefined}
              >
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
                {pair.usageText ? (
                  <JpVocabUsageFrequencyBars
                    oralFrequency={pair.oralFrequency}
                    examFrequency={pair.examFrequency}
                  />
                ) : null}
                {connText ? (
                  <JpVocabConnectionBody text={connText} showLabel />
                ) : null}
                {showLevel ? (
                  <div
                    className="jp-vocab-levels en-usage-ex-paired-levels"
                    role="group"
                    aria-label={`${pair.usageLabel}熟悉程度`}
                  >
                    {LEVELS.map((lv) => {
                      const checked = selectedLevel === lv.key;
                      return (
                        <button
                          key={lv.key}
                          type="button"
                          className={`jp-vocab-level-opt${
                            checked ? " is-checked" : ""
                          }${
                            usageLevelControls.disabled
                              ? " jp-vocab-level-opt--locked"
                              : ""
                          }${lv.key === "very" ? " jp-vocab-level-opt--very" : ""}${
                            lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                          }`}
                          disabled={usageLevelControls.disabled}
                          aria-pressed={checked}
                          title={
                            usageLevelControls.disabled
                              ? usageLevelControls.disabledReason ||
                                "当前不可修改熟悉程度"
                              : undefined
                          }
                          onClick={() => {
                            if (usageLevelControls.disabled) return;
                            usageLevelControls.onSelect(usageIndex, lv.key);
                          }}
                        >
                          <span className="jp-vocab-check-box" aria-hidden="true">
                            {checked ? (
                              <svg viewBox="0 0 12 12" width="10" height="10">
                                <path
                                  d="M2 6l3 3 5-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : null}
                          </span>
                          <span>{lv.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {pair.example?.text ? (
                  <div className="en-usage-ex-paired-en-row">
                    <EnVocabSpeakButton
                      text={pair.example.text}
                      title={`朗读整句：${pair.example.text}`}
                      className="en-usage-ex-paired-en-speak"
                    />
                    <div className="en-usage-ex-paired-en-col">
                      <p className="en-usage-ex-paired-en">{pair.example.text}</p>
                      {glossLine ? (
                        <p className="en-usage-ex-paired-gloss">{glossLine}</p>
                      ) : null}
                    </div>
                  </div>
                ) : pair.usageText ? (
                  <p className="en-usage-ex-paired-example-missing">（暂无对应用例）</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {leftoverConnectionNotes ? (
        <p className="en-usage-ex-paired-conn-note">{leftoverConnectionNotes}</p>
      ) : null}

      {imageBlock ? (
        <div className="en-usage-ex-paired-images">
          <EnVocabClassNoteContent content={imageBlock} imageLabel="用法图片" />
        </div>
      ) : null}

      {sourceLabels.length > 0 ? (
        <div className="en-usage-ex-paired-sources">
          {sourceLabels.map((src) => (
            <JpVocabSourceLabel key={src} source={src} />
          ))}
        </div>
      ) : null}

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
        :global(.en-usage-ex-paired-levels) {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin: 0.15rem 0 0.5rem;
          padding: 0.4rem 0.5rem;
          border: 1.5px solid color-mix(in srgb, var(--accent) 55%, var(--border));
          border-radius: 8px;
          background: color-mix(in srgb, var(--accent) 10%, transparent);
          box-sizing: border-box;
        }
        :global(.en-usage-ex-paired-levels .jp-vocab-level-opt) {
          font-size: 0.78rem;
          padding: 0.2rem 0.45rem;
        }
        .en-usage-ex-paired-en-row {
          display: flex;
          align-items: flex-start;
          gap: 0.4rem;
          min-width: 0;
        }
        .en-usage-ex-paired-en-col {
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .en-usage-ex-paired-en {
          margin: 0;
          line-height: 1.5;
          color: var(--text);
          font-size: 0.95rem;
        }
        :global(.en-usage-ex-paired-en-speak.en-vocab-speak-btn) {
          flex: 0 0 auto;
          width: 2rem;
          height: 2rem;
          margin-top: 0.05rem;
          padding: 0;
          border-radius: 999px;
          touch-action: manipulation;
        }
        @media (max-width: 767px) {
          :global(.en-usage-ex-paired-en-speak.en-vocab-speak-btn) {
            width: 2.5rem;
            height: 2.5rem;
          }
        }
        .en-usage-ex-paired-gloss {
          margin: 0;
          line-height: 1.45;
          color: var(--muted);
          font-size: 0.875rem;
        }
        .en-usage-ex-paired-example-missing {
          margin: 0.15rem 0 0;
          color: var(--muted);
          font-size: 0.8rem;
        }
        .en-usage-ex-paired-conn-note {
          margin: 0;
          padding: 0.45rem 0.55rem;
          line-height: 1.5;
          font-size: 0.875rem;
          color: var(--muted);
          white-space: pre-wrap;
          word-break: break-word;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
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
