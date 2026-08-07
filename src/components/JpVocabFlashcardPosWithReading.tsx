"use client";

import { JpVocabPitchAccentText } from "@/components/JpVocabPitchAccentText";
import { resolveJpVocabReadingPitchDisplay } from "@/lib/jp-vocab-pitch-accent";
import type { JpVocabKind } from "@/lib/types";

type Props = {
  posTrim: string;
  reading: string | null | undefined;
  word: string | null | undefined;
  kind: JpVocabKind;
  pitchAccent?: string | null;
};

/**
 * 卡片信息区「词性」行：词性 pill + 「读音」标签 +（有 OJAD 时）平假名顶横线。
 * OJAD 查无：pitch 为空，只显示库里读音，不多提示。
 */
export function JpVocabFlashcardPosWithReading({
  posTrim,
  reading,
  word,
  kind,
  pitchAccent,
}: Props) {
  const showReading = kind === "word";
  const readingTrim = (reading ?? "").trim();
  const { readingText, pitch } = showReading
    ? resolveJpVocabReadingPitchDisplay(pitchAccent, reading, word, kind)
    : { readingText: readingTrim, pitch: null };
  // 无音调时用库里读音原文；有音调时用平假名+横线
  const readingDisplay = pitch ? readingText || readingTrim : readingTrim;

  const readingBody = (() => {
    if (!showReading) return null;
    if (!readingDisplay) {
      return (
        <span className="jp-vocab-teacher-quiz__pos-pitch-pending">
          待补全
        </span>
      );
    }
    if (pitch) {
      return (
        <JpVocabPitchAccentText
          pitchAccent={pitch}
          displayText={readingDisplay}
          className="jp-vocab-teacher-quiz__pos-pitch jp-vocab-pitch-accent--pos"
        />
      );
    }
    return (
      <span className="jp-vocab-teacher-quiz__pos-pitch-plain">
        {readingDisplay}
      </span>
    );
  })();

  return (
    <dd
      className={
        posTrim || readingDisplay
          ? "jp-vocab-teacher-quiz__pos-reading-dd"
          : "jp-vocab-teacher-quiz__meta-empty jp-vocab-teacher-quiz__pos-reading-dd"
      }
    >
      <div className="jp-vocab-teacher-quiz__pos-reading-row">
        {posTrim ? (
          <span className="jp-vocab-teacher-quiz__pos">{posTrim}</span>
        ) : null}
        {showReading ? (
          <span className="jp-vocab-teacher-quiz__reading-inline">
            <span className="jp-vocab-teacher-quiz__reading-inline-label">
              读音
            </span>
            {readingBody}
          </span>
        ) : null}
      </div>
    </dd>
  );
}
