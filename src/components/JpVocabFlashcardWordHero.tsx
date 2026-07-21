"use client";

import { useCallback, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabFlashcardCopyButton } from "@/components/JpVocabFlashcardCopyButton";
import type { JpVocabKind, JpVocabRef } from "@/lib/types";

type Props = {
  readingTrim: string;
  wordTrim: string;
  /** 单词/语法：显示在词条旁的醒目前缀（「单词：」「语法：」） */
  kind?: JpVocabKind;
  refKey?: string | null;
  ref?: JpVocabRef;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  titleId?: string;
  /** 复习卡片：先隐藏假名/读音，展开后再显示 */
  hideReading?: boolean;
};

export function JpVocabFlashcardWordHero({
  readingTrim,
  wordTrim,
  kind,
  refKey,
  ref,
  onOpenRef,
  titleId,
  hideReading = false,
}: Props) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const onCopied = useCallback((message: string) => setCopyToast(message), []);

  const showReadingPrimary = Boolean(readingTrim) && !hideReading;
  const showKanjiAside =
    showReadingPrimary && Boolean(wordTrim) && wordTrim !== readingTrim;
  const copyReadingTrim = hideReading ? "" : readingTrim;
  const kindLabel =
    kind === "grammar" ? "语法：" : kind === "word" ? "单词：" : null;

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
            {kindLabel ? (
              <span
                className={`jp-vocab-teacher-quiz__kind-prefix${
                  kind === "grammar"
                    ? " jp-vocab-teacher-quiz__kind-prefix--grammar"
                    : ""
                }`}
              >
                {kindLabel}
              </span>
            ) : null}
            {renderReading()}
            {showKanjiAside ? renderKanji() : null}
            <JpVocabFlashcardCopyButton
              readingTrim={copyReadingTrim}
              wordTrim={wordTrim}
              onCopied={onCopied}
            />
          </div>
        ) : (
          <div className="jp-vocab-teacher-quiz__reading-row">
            {kindLabel ? (
              <span
                className={`jp-vocab-teacher-quiz__kind-prefix${
                  kind === "grammar"
                    ? " jp-vocab-teacher-quiz__kind-prefix--grammar"
                    : ""
                }`}
              >
                {kindLabel}
              </span>
            ) : null}
            {renderWordMain()}
            <JpVocabFlashcardCopyButton
              readingTrim={copyReadingTrim}
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
