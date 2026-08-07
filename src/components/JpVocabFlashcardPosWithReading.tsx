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
 * 卡片信息区「词性」行：词性 pill + 右侧读音（可平假名）+ OJAD 顶横线。
 * 不改 word 存库；顶部英雄区仍显示原词条。
 */
export function JpVocabFlashcardPosWithReading({
  posTrim,
  reading,
  word,
  kind,
  pitchAccent,
}: Props) {
  const showReading = kind === "word";
  const { readingText, pitch } = showReading
    ? resolveJpVocabReadingPitchDisplay(pitchAccent, reading, word, kind)
    : { readingText: (reading ?? "").trim(), pitch: null };
  const readingDisplay =
    readingText || (reading ?? "").trim() || (showReading ? "" : "");

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
          readingDisplay ? (
            pitch ? (
              <JpVocabPitchAccentText
                pitchAccent={pitch}
                displayText={readingDisplay}
                className="jp-vocab-teacher-quiz__pos-pitch jp-vocab-pitch-accent--pos"
              />
            ) : (
              <span className="jp-vocab-teacher-quiz__pos-pitch-plain">
                {readingDisplay}
              </span>
            )
          ) : (
            <span className="jp-vocab-teacher-quiz__pos-pitch-pending">
              待补全读音
            </span>
          )
        ) : null}
      </div>
    </dd>
  );
}
