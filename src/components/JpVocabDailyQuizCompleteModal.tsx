"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Variant = "teacher" | "study";

type Props = {
  open: boolean;
  total: number;
  variant: Variant;
  onClose: () => void;
};

const COPY: Record<
  Variant,
  { title: string; lines: string[]; button: string }
> = {
  teacher: {
    title: "恭喜你，今日单词已抽完",
    lines: [
      "今日单词/语法已全部抽查完毕，辛苦了！",
      "可以稍作休息，明天继续加油。",
    ],
    button: "好的",
  },
  study: {
    title: "今日单词已抽背完",
    lines: [
      "老师今天的单词抽查已全部完成。",
      "温故知新，继续保持学习节奏，加油！",
    ],
    button: "知道了",
  },
};

export function JpVocabDailyQuizCompleteModal({
  open,
  total,
  variant,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const copy = COPY[variant];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="jp-vocab-complete-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="jp-vocab-complete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-vocab-complete-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-vocab-complete-modal-icon" aria-hidden="true">
          ✓
        </div>
        <h2 id="jp-vocab-complete-modal-title" className="jp-vocab-complete-modal-title">
          {copy.title}
        </h2>
        <p className="jp-vocab-complete-modal-sub">
          今日共 {total} 个单词/语法
        </p>
        <div className="jp-vocab-complete-modal-body">
          {copy.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-complete-modal-btn"
          onClick={onClose}
        >
          {copy.button}
        </button>
      </div>
      <style jsx>{`
        .jp-vocab-complete-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1001;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.75rem, 3vw, 1.25rem);
          background: rgba(8, 12, 18, 0.72);
          backdrop-filter: blur(2px);
        }
        .jp-vocab-complete-modal {
          width: min(24rem, 96vw);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 1.35rem 1.25rem 1.15rem;
          background: var(--panel);
          border: 1px solid color-mix(in srgb, var(--fall) 35%, var(--border));
          border-radius: 12px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-vocab-complete-modal-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 3rem;
          height: 3rem;
          margin-bottom: 0.75rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--fall) 18%, var(--panel));
          color: var(--fall);
          font-size: 1.5rem;
          font-weight: 700;
          line-height: 1;
        }
        .jp-vocab-complete-modal-title {
          margin: 0 0 0.35rem;
          font-size: 1.15rem;
          font-weight: 600;
          color: var(--text);
        }
        .jp-vocab-complete-modal-sub {
          margin: 0 0 0.85rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-complete-modal-body {
          width: 100%;
          margin-bottom: 1rem;
        }
        .jp-vocab-complete-modal-body p {
          margin: 0;
          font-size: 0.9375rem;
          line-height: 1.65;
          color: var(--text);
        }
        .jp-vocab-complete-modal-body p + p {
          margin-top: 0.35rem;
        }
        .jp-vocab-complete-modal-btn {
          min-width: 7rem;
        }
        @media (max-width: 480px) {
          .jp-vocab-complete-modal-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-vocab-complete-modal {
            width: 100%;
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
