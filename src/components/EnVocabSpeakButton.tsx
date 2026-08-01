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
  /**
   * icon：词表旁小喇叭（默认）
   * label：抽问卡等「播放本单词」文字小按钮（勿再用纯图标）
   */
  variant?: "icon" | "label";
  /** variant=label 时的按钮文案 */
  labelText?: string;
};

export function EnVocabSpeakButton({
  text,
  title,
  className,
  disabled = false,
  variant = "icon",
  labelText = "播放本单词",
}: Props) {
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(false);
  const aria = title ?? `播放读音：${text}`;

  useEffect(() => {
    setSupported(canSpeakEnVocab());
  }, []);

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

  // 词表图标：不支持则不占位；抽问卡文字按钮始终露出，便于老师找到
  if (variant === "icon" && !supported) return null;

  const isLabel = variant === "label";
  const classes = [
    "en-vocab-speak-btn",
    isLabel ? "en-vocab-speak-btn--label" : "",
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
      title={
        supported
          ? aria
          : "当前浏览器不支持朗读"
      }
      disabled={disabled || playing || !supported}
      onClick={handleClick}
    >
      {isLabel ? (
        <span>{playing ? "播放中…" : labelText}</span>
      ) : (
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
      )}
    </button>
  );
}
