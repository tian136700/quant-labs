"use client";

import { formatJpVocabSourceDisplay } from "@/lib/jp-vocab-source-display";

type Props = {
  /** 原始来源，如「本地 gemma4:26b」「Qwen3 线上」「手动」 */
  source?: string | null;
  /** 仅用于 title 悬停，不渲染在界面上 */
  label?: string;
  className?: string;
  /** corner=贴在父级（需 position:relative）右下角；inline=跟在文案后 */
  placement?: "corner" | "inline";
};

/**
 * 来源角标：不写「释义来源：」前缀；展示为「模型/版本 · 本地|线上」。
 * 小号等宽字体，默认贴父容器右下角。
 */
export function JpVocabSourceLabel({
  source,
  label = "来源",
  className,
  placement = "corner",
}: Props) {
  const display = formatJpVocabSourceDisplay(source);
  if (!display) return null;
  return (
    <>
      <span
        className={[
          "jp-vocab-source-label",
          placement === "corner"
            ? "jp-vocab-source-label--corner"
            : "jp-vocab-source-label--inline",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        title={`${label}：${display}`}
      >
        {display}
      </span>
      <style jsx>{`
        .jp-vocab-source-label {
          font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          font-size: 0.625rem;
          font-weight: 500;
          line-height: 1.25;
          letter-spacing: 0.01em;
          color: color-mix(in srgb, var(--muted) 72%, transparent);
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .jp-vocab-source-label--corner {
          position: absolute;
          right: 0;
          bottom: 0;
          text-align: right;
        }
        .jp-vocab-source-label--inline {
          display: inline;
          vertical-align: baseline;
          white-space: normal;
        }
      `}</style>
    </>
  );
}
