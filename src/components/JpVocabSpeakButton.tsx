"use client";

import { useCallback, useEffect, useState } from "react";
import {
  canSpeakJpVocab,
  speakJpVocabText,
  stopJpVocabSpeech,
} from "@/lib/jp-vocab-pronounce";

type Props = {
  text: string;
  title?: string;
  className?: string;
  disabled?: boolean;
  variant?: "icon" | "label";
  labelText?: string;
};

function SpeakHornIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
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
  );
}

export function JpVocabSpeakButton({
  text,
  title,
  className,
  disabled = false,
  variant = "icon",
  labelText = "播放读音",
}: Props) {
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(false);
  const aria = title ?? `播放读音：${text}`;

  useEffect(() => {
    setSupported(canSpeakJpVocab());
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const onVoices = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener("voiceschanged", onVoices);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopJpVocabSpeech();
    };
  }, []);

  const handleClick = useCallback(() => {
    if (disabled || !supported || playing) return;
    const ok = speakJpVocabText(text, {
      onStart: () => setPlaying(true),
      onEnd: () => setPlaying(false),
      onError: () => setPlaying(false),
    });
    if (!ok) setPlaying(false);
  }, [disabled, playing, supported, text]);

  if (variant === "icon" && !supported) return null;

  const isLabel = variant === "label";
  const classes = [
    "jp-vocab-speak-btn",
    isLabel ? "jp-vocab-speak-btn--label" : "",
    playing ? "is-playing" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-label={aria}
      title="点击播放日语读音（本机语音）"
      disabled={disabled || playing || !supported}
      onClick={handleClick}
    >
      <SpeakHornIcon size={isLabel ? 18 : 16} />
      {isLabel ? <span className="jp-vocab-speak-btn__label">{labelText}</span> : null}
    </button>
  );
}
