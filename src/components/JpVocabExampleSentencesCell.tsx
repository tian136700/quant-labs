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
          {block.lines.map((line, lineIndex) => (
            <div key={lineIndex} className="jp-vocab-example-sentences-line">
              {lineIndex === 0 ? `${block.index}. ${line}` : line}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
