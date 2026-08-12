"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { tryCloseBrowserTab } from "@/lib/try-close-browser-tab";

type Props = {
  open: boolean;
  onViewLastWord?: () => void;
  /**
   * 抽查卡仍开着（已停在末词）：不必再「查看上一个单词」，
   * 关弹窗即可继续在末词上点「上一个」。
   */
  flashcardStillOpen?: boolean;
  onClose: () => void;
};

const CLOSE_TAB_HINT =
  "浏览器不允许自动关闭此标签，请手动关闭本窗口。";

/** 老师端本轮抽查完成提示（对齐日语完成弹窗；不展示数量） */
export function EnVocabDailyQuizCompleteModal({
  open,
  onViewLastWord,
  flashcardStillOpen = false,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [closeTabHint, setCloseTabHint] = useState<string | null>(null);
  const showViewLast = Boolean(onViewLastWord) && !flashcardStillOpen;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setCloseTabHint(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="en-vocab-complete-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="en-vocab-complete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-vocab-complete-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="en-vocab-complete-modal-icon" aria-hidden="true">
          ✓
        </div>
        <h2
          id="en-vocab-complete-modal-title"
          className="en-vocab-complete-modal-title"
        >
          本轮单词已抽查完成
        </h2>
        <div className="en-vocab-complete-modal-body">
          <p>本轮单词已全部抽查完毕，辛苦了！</p>
          <p>
            {flashcardStillOpen
              ? "将停留在最后一个词；可点「上一个」回看。"
              : "可以回看刚抽过的词条。"}
          </p>
        </div>
        <div className="en-vocab-complete-modal-actions">
          {showViewLast ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary en-vocab-complete-modal-btn"
              onClick={onViewLastWord}
            >
              查看上一个单词
            </button>
          ) : null}
          <div className="en-vocab-complete-modal-actions-row">
            <button
              type="button"
              className="btn-rsi-filter en-vocab-complete-modal-btn"
              onClick={() => {
                setCloseTabHint(null);
                tryCloseBrowserTab(() => setCloseTabHint(CLOSE_TAB_HINT));
              }}
            >
              关闭本窗口
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary en-vocab-complete-modal-btn"
              onClick={onClose}
            >
              停留在本页面
            </button>
          </div>
          {closeTabHint ? (
            <p className="en-vocab-complete-modal-close-hint" role="status">
              {closeTabHint}
            </p>
          ) : null}
        </div>
      </div>
      <style jsx>{`
        .en-vocab-complete-modal-overlay {
          position: fixed;
          inset: 0;
          /* 须高于抽查卡 (~1002)，否则抽完留末词时弹窗会藏在卡片后面 */
          z-index: 1105;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.75rem, 3vw, 1.25rem);
          background: rgba(8, 12, 18, 0.72);
          backdrop-filter: blur(2px);
        }
        .en-vocab-complete-modal {
          width: min(26rem, 96vw);
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
        .en-vocab-complete-modal-icon {
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
        .en-vocab-complete-modal-title {
          margin: 0 0 0.35rem;
          font-size: 1.15rem;
          font-weight: 600;
          color: var(--text);
        }
        .en-vocab-complete-modal-body {
          width: 100%;
          margin-bottom: 1rem;
        }
        .en-vocab-complete-modal-body p {
          margin: 0;
          font-size: 0.9375rem;
          line-height: 1.65;
          color: var(--text);
        }
        .en-vocab-complete-modal-body p + p {
          margin-top: 0.35rem;
        }
        .en-vocab-complete-modal-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .en-vocab-complete-modal-actions-row {
          display: flex;
          flex-direction: row;
          gap: 0.5rem;
          width: 100%;
        }
        .en-vocab-complete-modal-actions-row .en-vocab-complete-modal-btn {
          flex: 1;
          min-width: 0;
          width: auto;
        }
        .en-vocab-complete-modal-btn {
          width: 100%;
        }
        .en-vocab-complete-modal-close-hint {
          margin: 0.15rem 0 0;
          font-size: 0.8125rem;
          line-height: 1.45;
          color: var(--muted);
        }
        @media (max-width: 480px) {
          .en-vocab-complete-modal-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .en-vocab-complete-modal {
            width: 100%;
            border-radius: 12px 12px 0 0;
            padding-bottom: calc(1.15rem + env(safe-area-inset-bottom, 0px));
          }
          .en-vocab-complete-modal-btn {
            font-size: clamp(0.8125rem, 3.4vw, 0.9375rem);
            line-height: 1.35;
            min-height: 2.75rem;
          }
        }
        @media (min-width: 481px) and (max-width: 1024px) {
          .en-vocab-complete-modal {
            width: min(28rem, 92vw);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
