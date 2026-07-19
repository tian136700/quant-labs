"use client";

import {
  parseJpVocabParenFurigana,
  stripJpVocabParenFurigana,
} from "@/lib/jp-vocab-example-sentences";

type Props = {
  text: string | null | undefined;
  className?: string;
};

/**
 * 例句日语行展示：存库仍是「漢字(かな)」，这里渲染成汉字正下方小字假名。
 * 编辑框 / 定时任务写回请继续用括号格式，不要改存库。
 *
 * 用 flex 列而不是依赖 `ruby-position: under`（各浏览器默认常在上方）。
 */
export function JpVocabFuriganaText({ text, className }: Props) {
  const raw = text ?? "";
  if (!raw) return null;

  const segments = parseJpVocabParenFurigana(raw);
  const plain = stripJpVocabParenFurigana(raw);

  return (
    <span
      className={["jp-vocab-furigana-text", className].filter(Boolean).join(" ")}
      aria-label={plain}
    >
      {segments.map((seg, index) =>
        seg.type === "text" ? (
          <span key={`t-${index}`}>{seg.value}</span>
        ) : (
          <span
            key={`r-${index}`}
            className="jp-vocab-furigana-unit"
            title={seg.reading}
          >
            <span className="jp-vocab-furigana-base">{seg.base}</span>
            <span className="jp-vocab-furigana-reading" aria-hidden="true">
              {seg.reading}
            </span>
          </span>
        )
      )}
      <style jsx global>{`
        .jp-vocab-furigana-text {
          line-height: 1.15;
        }
        .jp-vocab-furigana-unit {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          vertical-align: baseline;
          margin: 0 0.01em;
          line-height: 1.05;
        }
        .jp-vocab-furigana-base {
          line-height: 1.15;
        }
        .jp-vocab-furigana-reading {
          display: block;
          font-size: 0.48em;
          font-weight: 500;
          line-height: 1.2;
          letter-spacing: 0;
          white-space: nowrap;
          color: color-mix(in srgb, currentColor 68%, transparent);
          user-select: none;
          margin-top: 0.06em;
        }
      `}</style>
    </span>
  );
}
