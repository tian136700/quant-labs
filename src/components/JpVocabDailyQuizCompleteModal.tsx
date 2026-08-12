"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { JpVocabCoachLevelCounts } from "@/lib/jp-vocab-coach";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { tryCloseBrowserTab } from "@/lib/try-close-browser-tab";

type Variant = "teacher" | "study";

type Props = {
  open: boolean;
  total: number;
  variant: Variant;
  levelCounts?: JpVocabCoachLevelCounts;
  coachBusy?: boolean;
  onGoToCoach?: () => void;
  /** 抽完后回看最后一个词；可再点卡片内「上一个」 */
  onViewLastWord?: () => void;
  /**
   * 抽查卡仍开着（已停在末词）：不必再「查看上一个单词」，
   * 关弹窗即可继续在末词上点「上一个」。
   */
  flashcardStillOpen?: boolean;
  onClose: () => void;
};

const COPY: Record<
  Variant,
  { title: string; lines: string[]; button: string }
> = {
  teacher: {
    title: "本轮单词已抽查完成",
    lines: [
      "本轮单词/语法已全部抽查完毕，辛苦了！",
      "将停留在最后一个词；可点「上一个」回看。",
    ],
    button: "停留在本页面",
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

const CLOSE_TAB_HINT =
  "浏览器不允许自动关闭此标签，请手动关闭本窗口。";

export function JpVocabDailyQuizCompleteModal({
  open,
  total,
  variant,
  levelCounts,
  coachBusy = false,
  onGoToCoach,
  onViewLastWord,
  flashcardStillOpen = false,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [closeTabHint, setCloseTabHint] = useState<string | null>(null);
  const copy = COPY[variant];
  const coachCount =
    variant === "teacher" && levelCounts
      ? levelCounts.normal + levelCounts.weak
      : 0;
  const showCoachAction = variant === "teacher" && onGoToCoach;
  const showViewLast =
    variant === "teacher" && onViewLastWord && !flashcardStillOpen;
  const showTeacherStayClose = variant === "teacher";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setCloseTabHint(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !coachBusy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, coachBusy, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!open || !mounted) return null;

  // total 保留 props 兼容；统计数字暂不展示
  void total;

  return createPortal(
    <div
      className="jp-vocab-complete-modal-overlay"
      role="presentation"
      onClick={() => {
        if (!coachBusy) onClose();
      }}
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

        <div className="jp-vocab-complete-modal-body">
          {copy.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <div className="jp-vocab-complete-modal-actions">
          {showViewLast ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-complete-modal-btn"
              disabled={coachBusy}
              onClick={() => onViewLastWord?.()}
            >
              查看上一个单词
            </button>
          ) : null}
          {showCoachAction ? (
            <button
              type="button"
              className="btn-rsi-filter jp-vocab-complete-modal-btn"
              disabled={coachBusy}
              onClick={() => onGoToCoach?.()}
            >
              {coachBusy
                ? "正在进入今日带读…"
                : coachCount > 0
                  ? `进入今日带读（本次 ${coachCount} 条）`
                  : "进入今日带读"}
            </button>
          ) : null}
          {showTeacherStayClose ? (
            <div className="jp-vocab-complete-modal-actions-row">
              <button
                type="button"
                className="btn-rsi-filter jp-vocab-complete-modal-btn"
                disabled={coachBusy}
                onClick={() => {
                  setCloseTabHint(null);
                  tryCloseBrowserTab(() => setCloseTabHint(CLOSE_TAB_HINT));
                }}
              >
                关闭本窗口
              </button>
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-complete-modal-btn"
                disabled={coachBusy}
                onClick={onClose}
              >
                停留在本页面
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-complete-modal-btn"
              disabled={coachBusy}
              onClick={onClose}
            >
              {copy.button}
            </button>
          )}
          {closeTabHint ? (
            <p className="jp-vocab-complete-modal-close-hint" role="status">
              {closeTabHint}
            </p>
          ) : null}
        </div>
      </div>
      <style jsx>{`
        .jp-vocab-complete-modal-overlay {
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
        .jp-vocab-complete-modal {
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
        .jp-vocab-complete-modal-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .jp-vocab-complete-modal-actions-row {
          display: flex;
          flex-direction: row;
          gap: 0.5rem;
          width: 100%;
        }
        .jp-vocab-complete-modal-actions-row .jp-vocab-complete-modal-btn {
          flex: 1;
          min-width: 0;
          width: auto;
        }
        .jp-vocab-complete-modal-btn {
          width: 100%;
        }
        .jp-vocab-complete-modal-close-hint {
          margin: 0.15rem 0 0;
          font-size: 0.8125rem;
          line-height: 1.45;
          color: var(--muted);
        }
        @media (max-width: 480px) {
          .jp-vocab-complete-modal-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-vocab-complete-modal {
            width: 100%;
            border-radius: 12px 12px 0 0;
            padding-bottom: calc(1.15rem + env(safe-area-inset-bottom, 0px));
          }
          .jp-vocab-complete-modal-btn {
            font-size: clamp(0.8125rem, 3.4vw, 0.9375rem);
            line-height: 1.35;
            min-height: 2.75rem;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
