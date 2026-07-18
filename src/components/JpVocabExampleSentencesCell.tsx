"use client";

import { formatJpVocabExampleSentencesForDisplay } from "@/lib/jp-vocab-example-sentences";

type Props = {
  text: string | null | undefined;
  /** 例句来源，显示在例句旁 */
  source?: string | null;
  emptyPlaceholder?: string;
};

export function JpVocabExampleSentencesCell({
  text,
  source,
  emptyPlaceholder = "—",
}: Props) {
  const blocks = formatJpVocabExampleSentencesForDisplay(text);
  const sourceLabel = (source || "").trim();
  if (!blocks.length) {
    return <span className="jp-vocab-example-sentences-empty">{emptyPlaceholder}</span>;
  }

  return (
    <div className="jp-vocab-example-sentences">
      {sourceLabel ? (
        <div className="jp-vocab-example-sentences-source" title="例句来源">
          例句来源：{sourceLabel}
        </div>
      ) : null}
      {blocks.map((block) => (
        <div key={block.index} className="jp-vocab-example-sentences-block">
          {block.lines.map((line, lineIndex) => {
            const showIndex = lineIndex === 0 && line.kind === "primary";
            return (
              <div
                key={lineIndex}
                className={
                  line.kind === "gloss"
                    ? "jp-vocab-example-sentences-line jp-vocab-example-sentences-line--gloss"
                    : "jp-vocab-example-sentences-line"
                }
              >
                {showIndex ? `${block.index}. ${line.text}` : line.text}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
