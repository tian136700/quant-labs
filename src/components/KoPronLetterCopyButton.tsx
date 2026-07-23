"use client";

import { useState } from "react";
import { CopyToast } from "@/components/CopyToast";
import { copyTextToClipboard } from "@/lib/copy-text";

type Props = {
  letter: string;
  /** compact = 列表旁；hero = 卡片字母下方居中；corner = 卡片右上角（与编辑并排，略小） */
  variant?: "compact" | "hero" | "corner";
  className?: string;
};

/**
 * 韩语字母旁「复制」：全韩语板块统一入口（勾选 / 抽问 / 复习 / 学生 / 卡片）。
 * 自带 CopyToast，调用方不必再挂一层。
 */
export function KoPronLetterCopyButton({
  letter,
  variant = "compact",
  className = "",
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const text = letter.trim();
  if (!text) return null;

  return (
    <>
      <button
        type="button"
        className={`ko-pron-letter-copy-btn ko-pron-letter-copy-btn--${variant}${
          className ? ` ${className}` : ""
        }`}
        title={`复制「${text}」`}
        aria-label={`复制「${text}」`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          void copyTextToClipboard(text).then((ok) =>
            setToast(ok ? "复制成功" : "复制失败")
          );
        }}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <rect
            x="7"
            y="7"
            width="9"
            height="9"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M5 13H4.5A1.5 1.5 0 0 1 3 11.5v-8A1.5 1.5 0 0 1 4.5 2h8A1.5 1.5 0 0 1 14 3.5V4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <span>复制</span>
      </button>
      <CopyToast message={toast} onDismiss={() => setToast(null)} />
      <style jsx>{`
        .ko-pron-letter-copy-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.2rem;
          flex-shrink: 0;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 40%, var(--panel));
          color: var(--muted);
          font-weight: 600;
          line-height: 1;
          cursor: pointer;
          vertical-align: middle;
        }
        .ko-pron-letter-copy-btn:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }
        .ko-pron-letter-copy-btn--compact {
          border-radius: 0.4rem;
          padding: 0.15rem 0.45rem;
          font-size: 0.72rem;
          margin-left: 0.35rem;
        }
        .ko-pron-letter-copy-btn--hero {
          border-radius: 0.55rem;
          padding: 0.4rem 0.75rem;
          font-size: 0.85rem;
          margin: 0.35rem 0.35rem 0 0;
        }
        .ko-pron-letter-copy-btn--corner {
          border-radius: 0.45rem;
          padding: 0.22rem 0.5rem;
          font-size: 0.72rem;
          margin: 0;
          gap: 0.15rem;
        }
        .ko-pron-letter-copy-btn--corner svg {
          width: 12px;
          height: 12px;
        }
        .ko-pron-letter-copy-btn svg {
          display: block;
        }
      `}</style>
    </>
  );
}
