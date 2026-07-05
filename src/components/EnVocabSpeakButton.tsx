"use client";

import { useCallback, useEffect, useState } from "react";
import {
  canSpeakEnVocab,
  speakEnVocabText,
  stopEnVocabSpeech,
} from "@/lib/en-vocab-pronounce";

type Props = {
  text: string;
  title?: string;
  className?: string;
  disabled?: boolean;
};

export function EnVocabSpeakButton({
  text,
  title,
  className,
  disabled = false,
}: Props) {
  const labelId = useId();
  const [playing, setPlaying] = useState(false);
  const supported = canSpeakEnVocab();
  const label = title ?? `播放读音：${text}`;

  useEffect(() => {
    return () => {
      stopEnVocabSpeech();
    };
  }, []);

  const handleClick = useCallback(() => {
    if (disabled || !supported || playing) return;
    const ok = speakEnVocabText(text, {
      onStart: () => setPlaying(true),
      onEnd: () => setPlaying(false),
      onError: () => setPlaying(false),
    });
    if (!ok) setPlaying(false);
  }, [disabled, playing, supported, text]);

  if (!supported) return null;

  return (
    <button
      type="button"
      className={`en-vocab-speak-btn${playing ? " is-playing" : ""}${className ? ` ${className}` : ""}`}
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
