import type { JpVocabWord } from "@/lib/types";

export function MobileLevelHistorySummary({ word }: { word: JpVocabWord }) {
  return (
    <div
      className="jp-vocab-level-history jp-vocab-mobile-only"
      aria-label="熟悉程度历史次数"
    >
      <span className="jp-vocab-level-history__item jp-vocab-level-history__item--very">
        非常熟悉 {word.cnt_very}
      </span>
      <span className="jp-vocab-level-history__sep" aria-hidden="true">
        ·
      </span>
      <span className="jp-vocab-level-history__item">一般 {word.cnt_normal}</span>
      <span className="jp-vocab-level-history__sep" aria-hidden="true">
        ·
      </span>
      <span className="jp-vocab-level-history__item jp-vocab-level-history__item--weak">
        不熟悉 {word.cnt_weak}
      </span>
    </div>
  );
}
