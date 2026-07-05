"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canSpeakJpVocab,
  jpVocabSpeakText,
  speakJpVocab,
  stopJpVocabSpeech,
} from "@/lib/jp-vocab-pronounce";

type Props = {
  word: string;
  reading?: string | null;
  title?: string;
  className?: string;
  disabled?: boolean;
};

export function JpVocabSpeakButton({
  word,
  reading,
  title,
  className,
  disabled = false,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const supported = canSpeakJpVocab();
  const speakText = useMemo(() => jpVocabSpeakText(word, reading), [word, reading]);
  const usingReading = Boolean((reading || "").trim());
  const label =
    title ??
    (usingReading
      ? `播放读音：${speakText}（浏览器合成音，音调仅供参考）`
      : `播放：${speakText}（暂无假名读音，可能不准；音调仅供参考）`);

  useEffect(() => {
    return () => {
      stopJpVocabSpeech();
    };
  }, []);

  const handleClick = useCallback(() => {
    if (disabled || !supported || playing) return;
    const ok = speakJpVocab(word, reading, {
      onStart: () => setPlaying(true),
      onEnd: () => setPlaying(false),
      onError: () => setPlaying(false),
    });
    if (!ok) setPlaying(false);
  }, [disabled, playing, reading, supported, word]);

  if (!supported) return null;

  return (
    <button
      type="button"
      className={`jp-vocab-speak-btn${playing ? " is-playing" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled || playing}
      onClick={handleClick}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path
          d="M9 3.5a1 1 0 0 1 1.447-.894l5 2.75A1 1 0 0 1 16 6.25v7.5a1 1 0 0 1-1.553.832l-5-2.75A1 1 0 0 1 9 11.75V3.5Z"
          fill="currentColor"
        />
        <path
          d="M4.5 7.5a.75.75 0 0 1 1.06 0 3.25 3.25 0 0 0 0 4.6.75.75 0 1 1-1.06 1.06 4.75 4.75 0 0 1 0-6.72.75.75 0 0 1 0 0Z"
          fill="currentColor"
        />
        <path
          d="M2.5 5.5a.75.75 0 0 1 1.06 0 6.5 6.5 0 0 0 0 9.192.75.75 0 1 1-1.06 1.06 8 8 0 0 1 0-11.312.75.75 0 0 1 0 0Z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
