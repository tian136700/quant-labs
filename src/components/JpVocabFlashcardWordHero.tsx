"use client";

import { useCallback, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabFlashcardCopyButton } from "@/components/JpVocabFlashcardCopyButton";
import type { JpVocabRef } from "@/lib/types";

type Props = {
  readingTrim: string;
  wordTrim: string;
  refKey?: string | null;
  ref?: JpVocabRef;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  titleId?: string;
};

export function JpVocabFlashcardWordHero({
  readingTrim,
  wordTrim,
  refKey,
  ref,
  onOpenRef,
  titleId,
}: Props) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const onCopied = useCallback((message: string) => setCopyToast(message), []);

  const showReadingPrimary = Boolean(readingTrim);
  const showKanjiAside =
    showReadingPrimary && Boolean(wordTrim) && wordTrim !== readingTrim;

  const renderReading = () =>
    refKey ? (
      <button
        type="button"
        className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__reading"
        title={ref?.title ? `教案：${ref.title}` : "查看教案"}
        onClick={() => onOpenRef(refKey, ref)}
      >
        {readingTrim}
      </button>
    ) : (
      <span className="jp-vocab-teacher-quiz__reading">{readingTrim}</span>
    );

  const renderKanji = () =>
    refKey ? (
      <button
        type="button"
        className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__kanji"
        title={ref?.title ? `教案：${ref.title}` : "查看教案"}
        onClick={() => onOpenRef(refKey, ref)}
      >
        {wordTrim}
      </button>
    ) : (
      <span className="jp-vocab-teacher-quiz__kanji">{wordTrim}</span>
    );

  const renderWordMain = () =>
    refKey ? (
      <button
        type="button"
        className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__word-main"
        title={ref?.title ? `教案：${ref.title}` : "查看教案"}
        onClick={() => onOpenRef(refKey, ref)}
      >
        {wordTrim || "—"}
      </button>
    ) : (
      <span className="jp-vocab-teacher-quiz__word-main">{wordTrim || "—"}</span>
    );

  return (
    <>
      <div className="jp-vocab-teacher-quiz__hero" id={titleId}>
        {showReadingPrimary ? (
          <div className="jp-vocab-teacher-quiz__reading-row">
            {renderReading()}
            {showKanjiAside ? renderKanji() : null}
            <JpVocabFlashcardCopyButton
              readingTrim={readingTrim}
              wordTrim={wordTrim}
              onCopied={onCopied}
            />
          </div>
        ) : (
          <div className="jp-vocab-teacher-quiz__reading-row">
            {renderWordMain()}
            <JpVocabFlashcardCopyButton
              readingTrim={readingTrim}
              wordTrim={wordTrim}
              onCopied={onCopied}
            />
          </div>
        )}
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

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />
    </>
  );
}
