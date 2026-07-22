"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  total: number;
  onClose: () => void;
};

export function KoPronDailyQuizCompleteModal({ open, total, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

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
        aria-labelledby="ko-pron-complete-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-vocab-complete-modal-icon" aria-hidden="true">
          ✓
        </div>
        <h2 id="ko-pron-complete-modal-title" className="jp-vocab-complete-modal-title">
          恭喜你，今日字母已抽完
        </h2>
        <p className="jp-vocab-complete-modal-line">
          今日韩语发音抽查（{total} 个）已全部完成，辛苦了！
        </p>
        <button type="button" className="jp-vocab-complete-modal-btn" onClick={onClose}>
          好的
        </button>
      </div>
    </div>,
    document.body
  );
}
