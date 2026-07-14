"use client";

import { formatJpVocabExampleSentencesForDisplay } from "@/lib/jp-vocab-example-sentences";

type Props = {
  text: string | null | undefined;
  emptyPlaceholder?: string;
};

export function JpVocabExampleSentencesCell({
  text,
  emptyPlaceholder = "—",
}: Props) {
  const blocks = formatJpVocabExampleSentencesForDisplay(text);
  if (!blocks.length) {
    return <span className="jp-vocab-example-sentences-empty">{emptyPlaceholder}</span>;
  }

  return (
    <div className="jp-vocab-example-sentences">
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
