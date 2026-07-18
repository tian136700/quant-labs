"use client";

import { formatJpVocabExampleSentencesForDisplay } from "@/lib/jp-vocab-example-sentences";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";

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
  if (!blocks.length) {
    return <span className="jp-vocab-example-sentences-empty">{emptyPlaceholder}</span>;
  }

  return (
    <div className="jp-vocab-example-sentences">
      <JpVocabSourceLabel source={source} label="例句来源" />
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
