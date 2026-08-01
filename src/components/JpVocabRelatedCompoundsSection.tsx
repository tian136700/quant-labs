"use client";

import { JpVocabFuriganaText } from "@/components/JpVocabFuriganaText";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import {
  JP_VOCAB_RELATED_COMPOUNDS_LABEL,
  parseJpVocabRelatedCompounds,
} from "@/lib/jp-vocab-related-compounds";

/** 抽问/带读/学生/复习卡：例句后展示「相关构词」 */
export function JpVocabRelatedCompoundsSection({
  relatedCompounds,
  relatedCompoundsSource,
  /** 语法词条不展示 */
  kind,
}: {
  relatedCompounds?: string | null;
  relatedCompoundsSource?: string | null;
  kind?: string | null;
}) {
  if (kind === "grammar") return null;
  const items = parseJpVocabRelatedCompounds(relatedCompounds);
  if (items.length === 0) return null;

  return (
    <section
      className="jp-vocab-teacher-quiz__related-compounds"
      aria-label={JP_VOCAB_RELATED_COMPOUNDS_LABEL}
    >
      <div className="jp-vocab-teacher-quiz__related-compounds-head">
        <h3 className="jp-vocab-teacher-quiz__related-compounds-title">
          {JP_VOCAB_RELATED_COMPOUNDS_LABEL}
        </h3>
        <JpVocabSourceLabel source={relatedCompoundsSource} />
      </div>
      <ul className="jp-vocab-teacher-quiz__related-compounds-list">
        {items.map((item) => (
          <li
            key={item.line}
            className="jp-vocab-teacher-quiz__related-compounds-item"
          >
            <span className="jp-vocab-teacher-quiz__related-compounds-jp">
              <JpVocabFuriganaText text={`${item.surface}(${item.reading})`} />
            </span>
            <span className="jp-vocab-teacher-quiz__related-compounds-sep">
              ：
            </span>
            <span className="jp-vocab-teacher-quiz__related-compounds-zh">
              {item.gloss}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
