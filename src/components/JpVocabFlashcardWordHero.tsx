"use client";

import { useCallback, useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { JpVocabFlashcardCopyButton } from "@/components/JpVocabFlashcardCopyButton";
import { JpVocabPitchAccentText } from "@/components/JpVocabPitchAccentText";
import { resolveJpVocabReadingPitchDisplay } from "@/lib/jp-vocab-pitch-accent";
import type { JpVocabKind, JpVocabRef } from "@/lib/types";

type Props = {
  readingTrim: string;
  wordTrim: string;
  /** OJAD 音调 JSON；仅 kind=word 时在读音区画顶横线 */
  pitchAccent?: string | null;
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
  pitchAccent,
  kind,
  refKey,
  ref,
  onOpenRef,
  titleId,
  hideReading = false,
}: Props) {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const onCopied = useCallback((message: string) => setCopyToast(message), []);

  const kindLabel =
    kind === "grammar" ? "语法：" : kind === "word" ? "单词：" : null;
  const copyReadingTrim = hideReading ? "" : readingTrim;
  const isWordKind = kind === "word";

  const { readingText, pitch } =
    isWordKind && !hideReading
      ? resolveJpVocabReadingPitchDisplay(
          pitchAccent,
          readingTrim,
          wordTrim,
          kind
        )
      : { readingText: readingTrim, pitch: null };

  const showWordRow = Boolean(wordTrim) || kind === "grammar";
  const showReadingPitchRow =
    isWordKind && !hideReading && Boolean(readingText || readingTrim || pitch);

  /** 语法：仍优先展示读音（无则词条） */
  const grammarPrimary = !isWordKind ? readingTrim || wordTrim : "";

  const renderWordLink = (
    text: string,
    className: string,
    title?: string
  ) =>
    refKey ? (
      <button
        type="button"
        className={`jp-vocab-teacher-quiz__word-link ${className}`}
        title={title ?? (ref?.title ? `教案：${ref.title}` : "查看教案")}
        onClick={() => onOpenRef(refKey, ref)}
      >
        {text}
      </button>
    ) : (
      <span className={className}>{text}</span>
    );

  const renderReadingPitchBody = () => {
    if (pitch && readingText) {
      return (
        <JpVocabPitchAccentText
          pitchAccent={pitch}
          displayText={readingText}
          className="jp-vocab-teacher-quiz__pitch-reading jp-vocab-pitch-accent--hero"
        />
      );
    }
    if (readingText) return readingText;
    if (readingTrim) return readingTrim;
    return (
      <span className="jp-vocab-teacher-quiz__reading-pending">待补全读音</span>
    );
  };

  return (
    <>
      <div className="jp-vocab-teacher-quiz__hero" id={titleId}>
        {isWordKind ? (
          <>
            {showWordRow ? (
              <div className="jp-vocab-teacher-quiz__reading-row jp-vocab-teacher-quiz__word-row">
                {kindLabel ? (
                  <span className="jp-vocab-teacher-quiz__kind-prefix">
                    {kindLabel}
                  </span>
                ) : null}
                {renderWordLink(
                  wordTrim || "—",
                  "jp-vocab-teacher-quiz__word-main"
                )}
                <JpVocabFlashcardCopyButton
                  readingTrim={copyReadingTrim}
                  wordTrim={wordTrim}
                  onCopied={onCopied}
                />
              </div>
            ) : null}
            {showReadingPitchRow ? (
              <div className="jp-vocab-teacher-quiz__reading-row jp-vocab-teacher-quiz__pitch-reading-row">
                {renderReadingPitchBody()}
              </div>
            ) : null}
          </>
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
            {renderWordLink(
              grammarPrimary || "—",
              readingTrim
                ? "jp-vocab-teacher-quiz__reading"
                : "jp-vocab-teacher-quiz__word-main"
            )}
            <JpVocabFlashcardCopyButton
              readingTrim={copyReadingTrim}
              wordTrim={wordTrim}
              onCopied={onCopied}
            />
          </div>
        )}
      </div>

      <CopyToast
        message={copyToast}
        onDismiss={() => setCopyToast(null)}
        className="copy-toast--above-modal"
      />
    </>
  );
}
