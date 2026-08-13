"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { EnVocabSpeakButton } from "@/components/EnVocabSpeakButton";
import type { EnVocabTeacherPronounceSignal } from "@/lib/en-vocab-teacher-quiz-live";
import { speakEnVocabText } from "@/lib/en-vocab-pronounce";

type Props = {
  signal: EnVocabTeacherPronounceSignal | null;
  onDismiss: () => void;
  /** 打开时尽量自动播一次（手机可能被拦截，仍可点按钮） */
  autoPlay?: boolean;
};

export function EnVocabStudentPronounceToast({
  signal,
  onDismiss,
  autoPlay = true,
}: Props) {
  useEffect(() => {
    if (!signal || !autoPlay) return;
    // 稍延迟，避开与弹层挂载同帧的部分浏览器限制
    const t = window.setTimeout(() => {
      speakEnVocabText(signal.text);
    }, 80);
    return () => window.clearTimeout(t);
  }, [signal?.at, signal?.text, autoPlay, signal]);

  if (!signal || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="en-vocab-pronounce-toast-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="en-vocab-pronounce-toast-title"
      onClick={onDismiss}
    >
      <div
        className="en-vocab-pronounce-toast"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="en-vocab-pronounce-toast__close"
          aria-label="关闭"
          onClick={onDismiss}
        >
          ×
        </button>
        <p
          id="en-vocab-pronounce-toast-title"
          className="en-vocab-pronounce-toast__title"
        >
          老师发送了读音
        </p>
        {/* 听音不看词：字形只给 TTS，弹框不渲染拼写；title 也不带单词 */}
        <div className="en-vocab-pronounce-toast__speak">
          <EnVocabSpeakButton
            text={signal.text}
            variant="label"
            labelText="再听一次"
            title="再听一次"
          />
        </div>
        <p className="en-vocab-pronounce-toast__hint">
          若未自动播放，请点上方按钮听标准读音
        </p>
      </div>
      <style jsx global>{`
        .en-vocab-pronounce-toast-overlay {
          position: fixed;
          inset: 0;
          z-index: 1120;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: max(1rem, env(safe-area-inset-top))
            max(1rem, env(safe-area-inset-right))
            max(1rem, env(safe-area-inset-bottom))
            max(1rem, env(safe-area-inset-left));
          background: color-mix(in srgb, #000 45%, transparent);
        }
        .en-vocab-pronounce-toast {
          position: relative;
          width: min(22rem, 100%);
          padding: 1.25rem 1.1rem 1.1rem;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel, var(--bg));
          box-shadow: 0 12px 40px color-mix(in srgb, #000 28%, transparent);
          text-align: center;
        }
        .en-vocab-pronounce-toast__close {
          position: absolute;
          top: 0.35rem;
          right: 0.45rem;
          width: 2.5rem;
          height: 2.5rem;
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
        }
        .en-vocab-pronounce-toast__title {
          margin: 0 0 1rem;
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--muted);
        }
        .en-vocab-pronounce-toast__speak {
          display: flex;
          justify-content: center;
        }
        .en-vocab-pronounce-toast__speak .en-vocab-speak-btn--label {
          min-height: 3.25rem;
          min-width: 10rem;
          padding: 0.75rem 1.25rem;
          font-weight: 700;
        }
        .en-vocab-pronounce-toast__speak .en-vocab-speak-btn--label svg {
          width: 1.35rem;
          height: 1.35rem;
        }
        .en-vocab-pronounce-toast__hint {
          margin: 0.75rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.4;
        }
        @media (max-width: 767px) {
          .en-vocab-pronounce-toast__speak .en-vocab-speak-btn--label {
            min-height: 3.5rem;
            width: 100%;
            max-width: 16rem;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
