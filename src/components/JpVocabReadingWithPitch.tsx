"use client";

import { JpVocabPitchAccentText } from "@/components/JpVocabPitchAccentText";
import { resolveJpVocabReadingPitchDisplay } from "@/lib/jp-vocab-pitch-accent";
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

/**
 * 词表「读音」列：读音可显示平假名；音调横线只标在读音上（不改 word 存库）。
 */
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
  const { readingText, pitch } = resolveJpVocabReadingPitchDisplay(
    pitchAccent,
    readingTrim,
    wordTrim,
    kind
  );
  const displayText =
    kind === "word" ? readingText || readingTrim : readingTrim;

  if (!displayText) {
    if (kind === "word") {
      return (
        <span className={`${className} jp-vocab-reading-text--pending`}>
          {pendingLabel}
        </span>
      );
    }
    return null;
  }

  const body =
    pitch != null ? (
      <JpVocabPitchAccentText
        pitchAccent={pitch}
        displayText={displayText}
        className={pitchClassName}
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

  return <span className={className}>{body}</span>;
}
