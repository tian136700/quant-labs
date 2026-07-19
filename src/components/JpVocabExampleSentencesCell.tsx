"use client";

import {
  formatJpVocabExampleGlossLine,
  parseJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";
import { JpVocabFuriganaText } from "@/components/JpVocabFuriganaText";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";

type Props = {
  text: string | null | undefined;
  /** 例句来源，显示在右下角 */
  source?: string | null;
  emptyPlaceholder?: string;
};

export function JpVocabExampleSentencesCell({
  text,
  source,
  emptyPlaceholder = "—",
}: Props) {
  const items = parseJpVocabExampleSentenceItems(text);
  if (!items.length) {
    return <span className="jp-vocab-example-sentences-empty">{emptyPlaceholder}</span>;
  }

  return (
    <div className="jp-vocab-example-sentences jp-vocab-example-sentences--with-source">
      {items.map((item, index) => (
        <div key={index} className="jp-vocab-example-sentences-block">
          <div className="jp-vocab-example-sentences-line">
            <span className="jp-vocab-example-sentences-index">{index + 1}. </span>
            <JpVocabFuriganaText text={item.text} />
          </div>
          {item.glossLines.map((gloss, glossIndex) => (
            <div
              key={`${index}-g-${glossIndex}`}
              className="jp-vocab-example-sentences-line jp-vocab-example-sentences-line--gloss"
            >
              {formatJpVocabExampleGlossLine(gloss)}
            </div>
          ))}
        </div>
      ))}
      <JpVocabSourceLabel source={source} />
    </div>
  );
}
