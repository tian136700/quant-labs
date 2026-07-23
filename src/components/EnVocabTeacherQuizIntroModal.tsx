"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { beijingDateString } from "@/lib/en-vocab-daily-check";

const STORAGE_KEY_PREFIX = "en-vocab-teacher-quiz-intro-v1";
const FOREVER_VALUE = "forever";

function introStorageKey(userId: number): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function shouldShowEnVocabTeacherQuizIntro(userId: number): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(introStorageKey(userId));
    if (stored === FOREVER_VALUE) return false;
    return stored !== beijingDateString();
  } catch {
    return true;
  }
}

function markEnVocabTeacherQuizIntroDismissed(userId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(introStorageKey(userId), beijingDateString());
  } catch {
    /* ignore */
  }
}

function markEnVocabTeacherQuizIntroDismissedForever(userId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(introStorageKey(userId), FOREVER_VALUE);
  } catch {
    /* ignore */
  }
}

type Props = {
  userId: number;
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function EnVocabTeacherQuizIntroModal({
  userId,
  open,
  onConfirm,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDontShowAgain(false);
  }, [open]);

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

  const handleConfirm = () => {
    if (dontShowAgain) {
      markEnVocabTeacherQuizIntroDismissedForever(userId);
    } else {
      markEnVocabTeacherQuizIntroDismissed(userId);
    }
    onConfirm();
  };

  return createPortal(
    <div
      className="jp-vocab-teacher-quiz-intro-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="jp-vocab-teacher-quiz-intro-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-vocab-teacher-quiz-intro-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-vocab-teacher-quiz-intro-header">
          <h2
            id="en-vocab-teacher-quiz-intro-title"
            className="jp-vocab-teacher-quiz-intro-title"
          >
            抽查操作说明
          </h2>
          <button
            type="button"
            className="jp-vocab-teacher-quiz-intro-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <div className="jp-vocab-teacher-quiz-intro-body">
          <ol className="jp-vocab-teacher-quiz-intro-list">
            <li>
              <strong>抽问学生</strong>：向学生随机提问（可用中文或英文），学生回答后，请根据实际掌握情况勾选「非常熟悉」「一般」或「不熟悉」。卡片右上角有<strong>计时器</strong>（00:00 起计），可参考学生思考快慢判断熟练度；勾选后计时停住，下一词重新从 00:00 开始。
            </li>
            <li>
              <strong>同步给学生</strong>：勾选熟悉程度后，该单词会自动同步到学生「今日英语单词」，供学生复习确认。
            </li>
          </ol>
          <p className="jp-vocab-teacher-quiz-intro-note" role="note">
            抽查进行中，熟悉程度请在单词卡片内勾选，列表不可直接改选。
          </p>
        </div>
        <div className="jp-vocab-teacher-quiz-intro-footer">
          <label className="jp-vocab-teacher-quiz-intro-never">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>不再显示此说明</span>
          </label>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            onClick={handleConfirm}
          >
            开始抽查
          </button>
        </div>
      </div>
      <style jsx>{`
        .jp-vocab-teacher-quiz-intro-overlay {
          position: fixed;
          inset: 0;
          z-index: 1002;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.75rem, 3vw, 1.25rem);
          background: rgba(8, 12, 18, 0.72);
          backdrop-filter: blur(2px);
        }
        .jp-vocab-teacher-quiz-intro-modal {
          width: min(30rem, 96vw);
          display: flex;
          flex-direction: column;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-vocab-teacher-quiz-intro-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem 1rem 0.75rem;
          border-bottom: 1px solid var(--border);
        }
        .jp-vocab-teacher-quiz-intro-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--text);
        }
        .jp-vocab-teacher-quiz-intro-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }
        .jp-vocab-teacher-quiz-intro-close:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        }
        .jp-vocab-teacher-quiz-intro-body {
          padding: 1rem;
        }
        .jp-vocab-teacher-quiz-intro-list {
          margin: 0;
          padding-left: 1.2rem;
          color: var(--text);
          font-size: 0.9375rem;
          line-height: 1.65;
        }
        .jp-vocab-teacher-quiz-intro-list li + li {
          margin-top: 0.65rem;
        }
        .jp-vocab-teacher-quiz-intro-list strong {
          font-weight: 600;
        }
        .jp-vocab-teacher-quiz-intro-note {
          margin: 0.85rem 0 0;
          font-size: 0.8125rem;
          line-height: 1.5;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz-intro-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          padding: 0 1rem 1rem;
        }
        .jp-vocab-teacher-quiz-intro-never {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          margin: 0;
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--muted);
          cursor: pointer;
          user-select: none;
        }
        .jp-vocab-teacher-quiz-intro-never input {
          width: 0.875rem;
          height: 0.875rem;
          margin: 0;
          flex-shrink: 0;
          accent-color: var(--accent);
          cursor: pointer;
        }
        @media (max-width: 480px) {
          .jp-vocab-teacher-quiz-intro-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-vocab-teacher-quiz-intro-modal {
            width: 100%;
            border-radius: 12px 12px 0 0;
          }
          .jp-vocab-teacher-quiz-intro-footer {
            flex-direction: column;
            align-items: stretch;
          }
          .jp-vocab-teacher-quiz-intro-footer :global(.btn-rsi-filter) {
            width: 100%;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
