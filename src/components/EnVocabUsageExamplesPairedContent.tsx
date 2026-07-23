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
  onSelect: (usageIndex: number, level: EnVocabLevel) => void;
  /** 点「下一个」时定位到的未勾用法下标（0-based） */
  focusIndex?: number | null;
};

type Props = {
  usage: string | null | undefined;
  exampleSentences: string | null | undefined;
  usageSource?: string | null;
  exampleSource?: string | null;
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
  model: modelProp,
  emptyText = "暂无用法与例句",
  className,
  usageLevelControls = null,
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
            const usageIndex = pair.index - 1;
            const showLevel =
              usageLevelControls != null && Boolean(pair.usageText);
            const selectedLevel = showLevel
              ? usageLevelControls.levels[usageIndex] ?? null
              : null;
            const focusThis =
              showLevel &&
              usageLevelControls.focusIndex != null &&
              usageLevelControls.focusIndex === usageIndex;
            return (
              <li
                key={pair.index}
                className={`en-usage-ex-paired-item${
                  focusThis ? " en-usage-ex-paired-item--focus" : ""
                }`}
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
                {showLevel ? (
                  <div
                    className={`jp-vocab-levels en-usage-ex-paired-levels${
                      focusThis ? " en-usage-ex-paired-levels--focus" : ""
                    }`}
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
          border-radius: 10px;
          transition: box-shadow 0.2s ease, background 0.2s ease;
        }
        .en-usage-ex-paired-item--focus {
          padding: 0.45rem 0.5rem;
          background: color-mix(in srgb, var(--rise) 12%, transparent);
          box-shadow: 0 0 0 2px var(--rise);
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
          border: 1.5px solid var(--rise);
          border-radius: 8px;
          background: color-mix(in srgb, var(--rise) 8%, transparent);
          box-sizing: border-box;
        }
        :global(.en-usage-ex-paired-levels--focus) {
          border-width: 2px;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--rise) 35%, transparent);
          animation: en-usage-level-focus-pulse 1.1s ease-in-out 2;
        }
        @keyframes en-usage-level-focus-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--rise) 35%, transparent);
          }
          50% {
            box-shadow: 0 0 0 6px color-mix(in srgb, var(--rise) 18%, transparent);
          }
        }
        :global(.en-usage-ex-paired-levels .jp-vocab-level-opt) {
          font-size: 0.78rem;
          padding: 0.2rem 0.45rem;
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
