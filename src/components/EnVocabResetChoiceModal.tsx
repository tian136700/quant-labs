"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onResetToday: () => void;
  onResetAll: () => void;
};

export function EnVocabResetChoiceModal({
  open,
  busy = false,
  onClose,
  onResetToday,
  onResetAll,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

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
      className="en-vocab- jp-vocab-reset-modal-overlay"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="en-vocab- jp-vocab-reset-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-vocab- jp-vocab-reset-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="en-vocab- jp-vocab-reset-modal-header">
          <h2 id="en-vocab- jp-vocab-reset-modal-title" className="en-vocab- jp-vocab-reset-modal-title">
            选择重置方式
          </h2>
          <button
            type="button"
            className="en-vocab- jp-vocab-reset-modal-close"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="en-vocab- jp-vocab-reset-modal-body">
          <p>
            <strong>今日重置</strong>：立即按抽查优先级重新排序，并清除当前轮次的序号勾与熟悉程度勾选；今日抽查次数、合计次数等统计不变。适合上午抽查后，下午换一位老师再抽一轮。
          </p>
          <p>
            <strong>全部重置</strong>：清空所有熟悉程度统计与今日抽查记录，并重排单词表，开始全新一轮复习。
          </p>
        </div>
        <div className="en-vocab- jp-vocab-reset-modal-footer">
          <button
            type="button"
            className="btn-rsi-filter"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            onClick={onResetToday}
            disabled={busy}
          >
            今日重置
          </button>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--danger"
            onClick={onResetAll}
            disabled={busy}
          >
            全部重置
          </button>
        </div>
      </div>
      <style jsx>{`
        .en-vocab- jp-vocab-reset-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.75rem, 3vw, 1.25rem);
          background: rgba(8, 12, 18, 0.72);
          backdrop-filter: blur(2px);
        }
        .en-vocab- jp-vocab-reset-modal {
          width: min(32rem, 96vw);
          display: flex;
          flex-direction: column;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .en-vocab- jp-vocab-reset-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem 1rem 0.75rem;
          border-bottom: 1px solid var(--border);
        }
        .en-vocab- jp-vocab-reset-modal-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 600;
        }
        .en-vocab- jp-vocab-reset-modal-close {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
          padding: 0.1rem 0.35rem;
        }
        .en-vocab- jp-vocab-reset-modal-close:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .en-vocab- jp-vocab-reset-modal-body {
          padding: 0.85rem 1rem 1rem;
          color: var(--muted);
          font-size: 0.9rem;
          line-height: 1.55;
        }
        .en-vocab- jp-vocab-reset-modal-body p {
          margin: 0 0 0.75rem;
        }
        .en-vocab- jp-vocab-reset-modal-body p:last-child {
          margin-bottom: 0;
        }
        .en-vocab- jp-vocab-reset-modal-body strong {
          color: var(--text);
        }
        .en-vocab- jp-vocab-reset-modal-footer {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.75rem 1rem 1rem;
          border-top: 1px solid var(--border);
        }
      `}</style>
    </div>,
    document.body
  );
}
