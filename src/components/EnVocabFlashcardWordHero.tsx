"use client";

import { EnVocabSpeakButton } from "@/components/EnVocabSpeakButton";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { displayEnVocabCategory } from "@/lib/en-vocab-category";
import type { EnVocabKind, EnVocabRef } from "@/lib/types";

type Props = {
  readingTrim: string;
  wordTrim: string;
  kind?: EnVocabKind;
  /** 雅思托福 / 托业 / IT面试 等 */
  category?: string | null;
  readingSource?: string | null;
  refKey?: string | null;
  ref?: EnVocabRef;
  onOpenRef: (refKey: string, ref?: EnVocabRef) => void;
  titleId?: string;
  /** 复习卡片：先隐藏音标，展开后再显示 */
  hideReading?: boolean;
};

export function EnVocabFlashcardWordHero({
  readingTrim,
  wordTrim,
  kind,
  category,
  readingSource,
  refKey,
  ref,
  onOpenRef,
  titleId,
  hideReading = false,
}: Props) {
  const showReading = Boolean(readingTrim) && !hideReading;
  const kindLabel = kind === "grammar" ? "语法：" : kind === "word" ? "单词：" : null;
  const categoryLabel = displayEnVocabCategory(category);

  return (
    <div className="jp-vocab-teacher-quiz__hero" id={titleId}>
      <div className="jp-vocab-teacher-quiz__reading-row en-vocab-flashcard-reading-row">
        <div className="en-vocab-flashcard-lemma-group">
          {kindLabel ? (
            <span
              className={`jp-vocab-teacher-quiz__kind-prefix en-vocab-flashcard-kind${
                kind === "grammar" ? " jp-vocab-teacher-quiz__kind-prefix--grammar" : ""
              }`}
            >
              {kindLabel}
            </span>
          ) : null}
          {refKey ? (
            <button
              type="button"
              className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__word-main en-vocab-flashcard-lemma"
              title={ref?.title ? `教案：${ref.title}` : "查看教案"}
              onClick={() => onOpenRef(refKey, ref)}
            >
              {wordTrim || "—"}
            </button>
          ) : (
            <span className="jp-vocab-teacher-quiz__word-main en-vocab-flashcard-lemma">
              {wordTrim || "—"}
            </span>
          )}
          <span
            className="en-vocab-flashcard-category"
            title={`分类：${categoryLabel}`}
          >
            {categoryLabel}
          </span>
        </div>
        {showReading ? (
          <span
            className="jp-vocab-teacher-quiz__kanji en-vocab-flashcard-ipa"
            title={readingTrim}
          >
            {readingTrim}
          </span>
        ) : null}
      </div>
      {wordTrim ? (
        <div className="en-vocab-flashcard-speak-row">
          <EnVocabSpeakButton text={wordTrim} variant="label" />
        </div>
      ) : null}
      {showReading ? (
        <div className="en-vocab-flashcard-ipa-source">
          <JpVocabSourceLabel source={readingSource} />
        </div>
      ) : hideReading && kind === "word" && !readingTrim ? null : hideReading ? null : kind ===
          "word" && !readingTrim ? (
        <p
          className="jp-vocab-teacher-quiz__meta-empty"
          style={{ margin: "0.35rem 0 0", textAlign: "center" }}
        >
          音标待补全
        </p>
      ) : null}
    </div>
  );
}
