"use client";

import { JpVocabPitchAccentText } from "@/components/JpVocabPitchAccentText";
import { resolveJpVocabPitchAccentForWord } from "@/lib/jp-vocab-pitch-accent";
import type { JpVocabKind } from "@/lib/types";

type Props = {
  reading: string | null | undefined;
  word: string | null | undefined;
  kind: JpVocabKind;
  pitchAccent?: string | null;
  className?: string;
  pitchClassName?: string;
  /** 点击复制读音时用 button 包裹 */
  copyButton?: {
    title: string;
    "aria-label": string;
    onClick: () => void;
  };
  pendingLabel?: string;
};

export function JpVocabReadingWithPitch({
  reading,
  word,
  kind,
  pitchAccent,
  className = "jp-vocab-reading-text",
  pitchClassName = "jp-vocab-pitch-accent--table",
  copyButton,
  pendingLabel = "待补全",
}: Props) {
  const readingTrim = (reading ?? "").trim();
  const wordTrim = (word ?? "").trim();
  const displayText = readingTrim || (kind === "word" ? wordTrim : readingTrim);
  const pitch = resolveJpVocabPitchAccentForWord(pitchAccent, readingTrim, wordTrim, kind);

  if (!displayText) {
    if (kind === "word") {
      return (
        <span className={`${className} jp-vocab-reading-text--pending`}>{pendingLabel}</span>
      );
    }
    return null;
  }

  const body =
    pitch != null ? (
      <JpVocabPitchAccentText
        pitchAccent={pitch}
        className={`${className} ${pitchClassName}`.trim()}
      />
    ) : (
      displayText
    );

  if (copyButton) {
    return (
      <button
        type="button"
        className={`${className} jp-vocab-reading-text--copy`}
        title={copyButton.title}
        aria-label={copyButton["aria-label"]}
        onClick={copyButton.onClick}
      >
        {body}
      </button>
    );
  }

  if (pitch != null) {
    return (
      <JpVocabPitchAccentText
        pitchAccent={pitch}
        className={`${className} ${pitchClassName}`.trim()}
      />
    );
  }

  return <span className={className}>{displayText}</span>;
}
