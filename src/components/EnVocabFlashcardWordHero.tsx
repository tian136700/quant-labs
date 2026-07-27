"use client";

import { EnVocabSpeakButton } from "@/components/EnVocabSpeakButton";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import type { EnVocabKind, EnVocabRef } from "@/lib/types";

type Props = {
  readingTrim: string;
  wordTrim: string;
  kind?: EnVocabKind;
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
  readingSource,
  refKey,
  ref,
  onOpenRef,
  titleId,
  hideReading = false,
}: Props) {
  const showReading = Boolean(readingTrim) && !hideReading;
  const kindLabel = kind === "grammar" ? "语法：" : kind === "word" ? "单词：" : null;

  return (
    <div className="jp-vocab-teacher-quiz__hero" id={titleId}>
      <div className="jp-vocab-teacher-quiz__reading-row en-vocab-flashcard-reading-row">
        <div className="en-vocab-flashcard-lemma-group">
          {wordTrim ? <EnVocabSpeakButton text={wordTrim} /> : null}
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
      {refKey ? (
        <button
          type="button"
          className="jp-vocab-teacher-quiz__ref-hint"
          title={ref?.title ? `教案：${ref.title}` : "查看教案"}
          onClick={() => onOpenRef(refKey, ref)}
        >
          （点击查看教案）
        </button>
      ) : null}
    </div>
  );
}
