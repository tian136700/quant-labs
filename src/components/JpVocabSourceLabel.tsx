"use client";

import { formatJpVocabSourceDisplay } from "@/lib/jp-vocab-source-display";

type Props = {
  /** 原始来源，如「本地 gemma4:26b」「Claude」「线上 claude-…」「手动」 */
  source?: string | null;
  className?: string;
  /** corner=单元格内右对齐块（默认）；inline=跟在文案后 */
  placement?: "corner" | "inline";
};

const LABEL_FONT =
  'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/**
 * 来源角标：「来源：Claude」|「来源：模型 · 本地」|「来源：手动」
 * 线上 Claude 一律短标 Claude（见 formatJpVocabSourceDisplay；Claude ≠ Cloud）。
 * corner 必须用文档流块级布局，禁止 position:absolute 依赖外层 relative
 *（否则缺 relative 时会漂到表右侧，叠住「操作」列）。
 */
export function JpVocabSourceLabel({
  source,
  className,
  placement = "corner",
}: Props) {
  const display = formatJpVocabSourceDisplay(source);
  if (!display) return null;
  const text = `来源：${display}`;
  const isCorner = placement === "corner";
  return (
    <span
      className={["jp-vocab-source-label", className].filter(Boolean).join(" ")}
      title={text}
      style={
        isCorner
          ? {
              display: "block",
              width: "100%",
              maxWidth: "100%",
              marginTop: "0.2rem",
              textAlign: "right",
              fontFamily: LABEL_FONT,
              fontSize: "0.625rem",
              fontWeight: 500,
              lineHeight: 1.25,
              letterSpacing: "0.01em",
              color: "color-mix(in srgb, var(--muted) 72%, transparent)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              boxSizing: "border-box",
            }
          : {
              fontFamily: LABEL_FONT,
              fontSize: "0.625rem",
              fontWeight: 500,
              lineHeight: 1.25,
              letterSpacing: "0.01em",
              color: "color-mix(in srgb, var(--muted) 72%, transparent)",
            }
      }
    >
      {text}
    </span>
  );
}
