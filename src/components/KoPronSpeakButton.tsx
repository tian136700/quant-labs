"use client";

import { useEffect, useState } from "react";
import {
  canUseKoPronSpeech,
  speakKoPronLetter,
} from "@/lib/ko-pron-speak";

type Props = {
  letter: string;
  reading?: string | null;
  /** compact = 列表小按钮；hero = 抽问卡大字母旁 */
  variant?: "compact" | "hero";
  className?: string;
};

export function KoPronSpeakButton({
  letter,
  reading,
  variant = "compact",
  className = "",
}: Props) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(canUseKoPronSpeech());
    // 部分浏览器需先 getVoices 才会加载语音列表
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const onVoices = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoices);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      };
    }
  }, []);

  if (!supported || !letter.trim()) return null;

  const label = speaking ? "播放中…" : "发音";

  return (
    <button
      type="button"
      className={`ko-pron-speak-btn ko-pron-speak-btn--${variant}${
        className ? ` ${className}` : ""
      }`}
      aria-label={`发音：${letter}`}
      title="点击播放韩语发音（本机语音）"
      disabled={speaking}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const ok = speakKoPronLetter(letter, reading);
        if (!ok) return;
        setSpeaking(true);
        window.setTimeout(() => setSpeaking(false), 1200);
      }}
    >
      <span className="ko-pron-speak-btn__icon" aria-hidden="true">
        ♪
      </span>
      <span className="ko-pron-speak-btn__label">{label}</span>
      <style jsx>{`
        .ko-pron-speak-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.28rem;
          border: 1px solid #fdba74;
          background: #fff7ed;
          color: #c2410c;
          cursor: pointer;
          font-weight: 600;
          line-height: 1.2;
        }
        .ko-pron-speak-btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .ko-pron-speak-btn--compact {
          border-radius: 0.4rem;
          padding: 0.2rem 0.45rem;
          font-size: 0.75rem;
          margin-left: 0.35rem;
          vertical-align: middle;
        }
        .ko-pron-speak-btn--hero {
          border-radius: 0.65rem;
          padding: 0.45rem 0.9rem;
          font-size: 0.9rem;
          margin: 0.35rem auto 0;
        }
        .ko-pron-speak-btn__icon {
          font-size: 0.95em;
        }
      `}</style>
    </button>
  );
}
