"use client";

import {
  formatEnVocabExampleGlossLine,
  parseEnVocabExampleSentenceItems,
} from "@/lib/en-vocab-example-sentences";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";

type Props = {
  text: string | null | undefined;
  source?: string | null;
  emptyPlaceholder?: string;
};

export function EnVocabExampleSentencesCell({
  text,
  source,
  emptyPlaceholder = "—",
}: Props) {
  const items = parseEnVocabExampleSentenceItems(text);
  if (!items.length) {
    return (
      <span className="jp-vocab-example-sentences-empty">{emptyPlaceholder}</span>
    );
  }

  return (
    <div className="jp-vocab-example-sentences jp-vocab-example-sentences--with-source">
      {items.map((item, index) => (
        <div key={index} className="jp-vocab-example-sentences-block">
          <div className="jp-vocab-example-sentences-line">
            <span className="jp-vocab-example-sentences-index">{index + 1}. </span>
            <span>{item.text}</span>
          </div>
          {item.gloss ? (
            <div className="jp-vocab-example-sentences-line jp-vocab-example-sentences-line--gloss">
              {formatEnVocabExampleGlossLine(item.gloss)}
            </div>
          ) : null}
        </div>
      ))}
      <JpVocabSourceLabel source={source} />
    </div>
  );
}
