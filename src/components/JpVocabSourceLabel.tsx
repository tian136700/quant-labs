"use client";

import { formatJpVocabSourceDisplay } from "@/lib/jp-vocab-source-display";

type Props = {
  /** 原始来源，如「本地 gemma4:26b」「Qwen3 线上」「手动」 */
  source?: string | null;
  className?: string;
  /** corner=父级右下角（默认）；inline=跟在文案后 */
  placement?: "corner" | "inline";
};

/**
 * 来源角标：右下角「来源：模型/版本 · 本地|线上」
 * 小号等宽字体，与释义正文区分。
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
              position: "absolute",
              right: 0,
              bottom: 0,
              textAlign: "right",
              fontFamily:
                'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: "0.625rem",
              fontWeight: 500,
              lineHeight: 1.25,
              letterSpacing: "0.01em",
              color: "color-mix(in srgb, var(--muted) 72%, transparent)",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }
          : {
              fontFamily:
                'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
