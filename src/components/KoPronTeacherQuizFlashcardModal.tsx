"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { KoPronLetterCopyButton } from "@/components/KoPronLetterCopyButton";
import { KoPronSpeakButton } from "@/components/KoPronSpeakButton";
import {
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
} from "@/lib/jp-vocab-save-progress";
import { koPronFinalQuizScoreOrNull } from "@/lib/ko-pron-daily-order";
import { koPronTeacherQuizModeLabel } from "@/lib/ko-pron-teacher-quiz";
import type { KoPronTeacherQuizMode } from "@/lib/ko-pron-teacher-quiz";
import type { KoPronLetter, KoPronLevel } from "@/lib/types";

const LEVELS: Array<{ key: KoPronLevel; label: string }> = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

type Props = {
  open: boolean;
  letter: KoPronLetter | null;
  mode: KoPronTeacherQuizMode;
  index: number;
  total: number;
  selectedLevel?: KoPronLevel;
  reviewLocked?: boolean;
  saveBusy?: boolean;
  savePercent?: number | null;
  saveQueued?: boolean;
  previewMode?: boolean;
  onSelectLevel: (level: KoPronLevel) => void;
  onNext: () => void;
  onClose: () => void;
  onEdit?: (letter: KoPronLetter) => void;
};

export function KoPronTeacherQuizFlashcardModal({
  open,
  letter,
  mode,
  index,
  total,
  selectedLevel,
  reviewLocked = false,
  saveBusy = false,
  savePercent = null,
  saveQueued = false,
  previewMode = false,
  onSelectLevel,
  onNext,
  onClose,
  onEdit,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [nextBlockedHint, setNextBlockedHint] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setNextBlockedHint(false);
  }, [letter?.id]);

  useEffect(() => {
    if (selectedLevel) setNextBlockedHint(false);
  }, [selectedLevel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (nextBlockedHint) {
          setNextBlockedHint(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, nextBlockedHint]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted || !letter) return null;

  const levelDisabled = previewMode || saveBusy || reviewLocked;
  const risk = koPronFinalQuizScoreOrNull(letter);
  const riskBadgeTier =
    risk == null ? "never" : risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
  const isLast = index >= total - 1;

  const tryGoNext = () => {
    if (previewMode) {
      onClose();
      return;
    }
    if (!selectedLevel) {
      setNextBlockedHint(true);
      return;
    }
    if (saveBusy) return;
    onNext();
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return createPortal(
    <div
      className="ko-pron-flashcard-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="ko-pron-flashcard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ko-pron-flashcard-title"
        onClick={stop}
      >
        <div className="ko-pron-flashcard-top">
          <span className="ko-pron-flashcard-mode">
            {koPronTeacherQuizModeLabel(mode)} · {index + 1}/{total}
          </span>
          <div className="ko-pron-flashcard-top-actions">
            <KoPronLetterCopyButton letter={letter.letter} variant="corner" />
            {onEdit ? (
              <button
                type="button"
                className="ko-pron-flashcard-edit-btn"
                onClick={() => onEdit(letter)}
              >
                编辑
              </button>
            ) : null}
            <button
              type="button"
              className="ko-pron-flashcard-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        </div>

        <h2 id="ko-pron-flashcard-title" className="ko-pron-flashcard-hero">
          {letter.letter}
        </h2>
        <div className="ko-pron-flashcard-hero-actions">
          <KoPronSpeakButton
            letter={letter.letter}
            reading={letter.reading}
            variant="hero"
          />
        </div>

        {/* 老师端始终显示罗马音辅助 */}
        <div className="ko-pron-flashcard-body">
          <p className="ko-pron-flashcard-reading-label">罗马音 / 读法</p>
          <p className="ko-pron-flashcard-reading">
            {letter.reading || "（无读音）"}
          </p>
          {letter.meaning ? (
            <p className="ko-pron-flashcard-meaning">{letter.meaning}</p>
          ) : null}
          {letter.category ? (
            <p className="ko-pron-flashcard-pos">{letter.category}</p>
          ) : null}
        </div>

        {!previewMode ? (
          <div className="ko-pron-flashcard-level">
            <p className="ko-pron-flashcard-level-label" role="note">
              请根据学生熟悉程度，勾选以下选项
            </p>
            <div
              className="ko-pron-flashcard-levels"
              role="group"
              aria-label="熟悉程度"
            >
              {LEVELS.map((item) => {
                const checked = selectedLevel === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`ko-pron-flashcard-level-opt${
                      checked ? " is-checked" : ""
                    }${reviewLocked ? " ko-pron-flashcard-level-opt--locked" : ""}${
                      item.key === "very"
                        ? " ko-pron-flashcard-level-opt--very"
                        : ""
                    }${
                      item.key === "weak"
                        ? " ko-pron-flashcard-level-opt--weak"
                        : ""
                    }`}
                    disabled={levelDisabled}
                    aria-pressed={checked}
                    title={
                      previewMode
                        ? "预览模式，勾选不会保存"
                        : reviewLocked
                          ? "勾选已满 1 小时，无法再修改"
                          : checked
                            ? "今日已选此项，可点其他选项改选（1 小时内）"
                            : "勾选学生熟悉程度"
                    }
                    onClick={() => {
                      if (levelDisabled) return;
                      setNextBlockedHint(false);
                      onSelectLevel(item.key);
                    }}
                  >
                    <span
                      className="ko-pron-flashcard-check-box"
                      aria-hidden="true"
                    >
                      {checked ? (
                        <svg viewBox="0 0 12 12" width="10" height="10">
                          <path
                            d="M2 6l3 3 5-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {saveBusy ? (
          <JpVocabSaveProgressBar
            label={jpVocabSaveProgressLabel("save_level", {
              queued: saveQueued,
            })}
            percent={
              savePercent != null
                ? savePercent
                : jpVocabSaveProgressDisplayPercent(null)
            }
            fullWidth
          />
        ) : null}

        <div className="ko-pron-flashcard-stats">
          <span
            className={`ko-pron-flashcard-risk ko-pron-flashcard-risk--${riskBadgeTier}`}
            title={
              risk == null
                ? "从未抽查：不按优先级计分，日序默认置顶"
                : "数值越大越应该被抽查（与日语同一算法）"
            }
          >
            抽查权重 {risk == null ? "—" : risk.toFixed(1)}
          </span>
          <span className="chg-dn">非常熟悉 {letter.cnt_very}</span>
          <span>一般 {letter.cnt_normal}</span>
          <span className="chg-up">不熟悉 {letter.cnt_weak}</span>
        </div>

        <div className="ko-pron-flashcard-actions">
          {!previewMode ? (
            <button
              type="button"
              className={`ko-pron-flashcard-next${
                !selectedLevel ? " ko-pron-flashcard-next--blocked" : ""
              }`}
              onClick={tryGoNext}
              disabled={saveBusy}
            >
              <span className="ko-pron-flashcard-next-main">
                {isLast ? "完成抽查" : "下一个"}
              </span>
              {!isLast && !selectedLevel ? (
                <span className="ko-pron-flashcard-next-sub">勾选后可点</span>
              ) : null}
            </button>
          ) : (
            <button
              type="button"
              className="ko-pron-flashcard-next"
              onClick={onClose}
            >
              关闭
            </button>
          )}
        </div>
      </div>

      {nextBlockedHint && !previewMode && !selectedLevel ? (
        <div
          className="ko-pron-flashcard-alert-overlay"
          role="presentation"
          onClick={() => setNextBlockedHint(false)}
        >
          <div
            className="ko-pron-flashcard-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ko-pron-flashcard-alert-title"
            aria-describedby="ko-pron-flashcard-alert-desc"
            onClick={stop}
          >
            <h3
              id="ko-pron-flashcard-alert-title"
              className="ko-pron-flashcard-alert__title"
            >
              请先勾选熟悉程度
            </h3>
            <p
              id="ko-pron-flashcard-alert-desc"
              className="ko-pron-flashcard-alert__desc"
            >
              请先勾选学生的熟悉程度，再进入下一个。
            </p>
            <button
              type="button"
              className="ko-pron-flashcard-alert__close"
              onClick={() => setNextBlockedHint(false)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .ko-pron-flashcard-overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          background: rgba(8, 12, 18, 0.78);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .ko-pron-flashcard {
          width: min(28rem, 100%);
          max-height: min(92vh, 40rem);
          overflow: auto;
          background: var(--panel);
          color: var(--text);
          border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
          border-radius: 1rem;
          padding: 1.1rem 1.2rem 1.25rem;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.38);
        }
        .ko-pron-flashcard-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .ko-pron-flashcard-mode {
          font-size: 0.78rem;
          color: var(--muted);
        }
        .ko-pron-flashcard-top-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.35rem;
          flex-shrink: 0;
        }
        .ko-pron-flashcard-close {
          border: none;
          background: transparent;
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
          color: var(--muted);
          padding: 0 0.1rem;
        }
        .ko-pron-flashcard-hero {
          margin: 0.5rem 0 0.35rem;
          text-align: center;
          font-weight: 700;
          font-size: 3.2rem;
          line-height: 1.1;
          color: var(--text);
        }
        .ko-pron-flashcard-hero-actions {
          display: flex;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin: 0 0 0.85rem;
        }
        .ko-pron-flashcard-edit-btn {
          border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
          border-radius: 0.45rem;
          padding: 0.22rem 0.55rem;
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
          color: var(--text);
          font-size: 0.72rem;
          font-weight: 600;
          line-height: 1;
          cursor: pointer;
        }
        .ko-pron-flashcard-next {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.15rem;
          width: 100%;
          margin-top: 0.75rem;
          border: none;
          border-radius: 0.65rem;
          padding: 0.7rem 1rem;
          background: #f97316;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
        }
        .ko-pron-flashcard-next--blocked {
          opacity: 0.85;
        }
        .ko-pron-flashcard-next-main {
          line-height: 1.2;
        }
        .ko-pron-flashcard-next-sub {
          font-size: 0.75rem;
          font-weight: 500;
          opacity: 0.92;
        }
        .ko-pron-flashcard-next:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ko-pron-flashcard-reading-label {
          text-align: center;
          font-size: 0.78rem;
          color: var(--muted);
          margin: 0.15rem 0 0.1rem;
        }
        .ko-pron-flashcard-reading {
          text-align: center;
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0.15rem 0 0.35rem;
          color: var(--text);
        }
        .ko-pron-flashcard-meaning,
        .ko-pron-flashcard-pos {
          text-align: center;
          color: var(--muted);
          margin: 0.25rem 0;
        }
        .ko-pron-flashcard-level {
          margin-top: 1rem;
          padding: 0.5rem 0.6rem;
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent) 6%, var(--bg));
          border: 1px solid color-mix(in srgb, var(--accent) 15%, var(--border));
        }
        .ko-pron-flashcard-level-label {
          margin: 0 0 0.4rem;
          font-size: 0.8125rem;
          font-weight: 600;
          line-height: 1.35;
          text-align: center;
          color: var(--rise);
        }
        .ko-pron-flashcard-levels {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem 0.5rem;
          width: 100%;
        }
        .ko-pron-flashcard-level-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          min-height: 2rem;
          padding: 0.35rem 0.5rem;
          font-size: 0.8125rem;
          font-weight: 400;
          cursor: pointer;
          white-space: nowrap;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: var(--text);
          font: inherit;
          line-height: 1.3;
        }
        .ko-pron-flashcard-check-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1rem;
          height: 1rem;
          flex-shrink: 0;
          border: 1.5px solid var(--border);
          border-radius: 3px;
          background: var(--bg);
          color: var(--accent);
        }
        .ko-pron-flashcard-level-opt.is-checked .ko-pron-flashcard-check-box {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 18%, var(--bg));
        }
        .ko-pron-flashcard-level-opt--very.is-checked {
          color: var(--fall);
        }
        .ko-pron-flashcard-level-opt--very.is-checked
          .ko-pron-flashcard-check-box {
          border-color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, var(--bg));
          color: var(--fall);
        }
        .ko-pron-flashcard-level-opt--weak.is-checked {
          color: var(--rise);
        }
        .ko-pron-flashcard-level-opt--weak.is-checked
          .ko-pron-flashcard-check-box {
          border-color: var(--rise);
          background: color-mix(in srgb, var(--rise) 18%, var(--bg));
          color: var(--rise);
        }
        .ko-pron-flashcard-level-opt.is-checked {
          background: rgba(61, 139, 253, 0.08);
        }
        .ko-pron-flashcard-level-opt:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.04);
        }
        .ko-pron-flashcard-level-opt:disabled {
          cursor: not-allowed;
        }
        .ko-pron-flashcard-level-opt--locked:disabled:not(.is-checked) {
          opacity: 0.78;
        }
        .ko-pron-flashcard-level-opt--locked.is-checked:disabled {
          opacity: 1;
        }
        .ko-pron-flashcard-stats {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 0.5rem 0.75rem;
          margin-top: 0.9rem;
          font-size: 0.78rem;
          color: var(--muted);
        }
        .ko-pron-flashcard-risk {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .ko-pron-flashcard-risk--low {
          color: var(--fall);
        }
        .ko-pron-flashcard-risk--mid {
          color: #f97316;
        }
        .ko-pron-flashcard-risk--high {
          color: var(--rise);
        }
        .ko-pron-flashcard-risk--never {
          color: var(--muted);
          font-weight: 500;
        }
        .ko-pron-flashcard-actions {
          margin-top: 0.35rem;
        }
        .ko-pron-flashcard-alert-overlay {
          position: fixed;
          inset: 0;
          z-index: 1300;
          background: rgba(8, 12, 18, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .ko-pron-flashcard-alert {
          width: min(22rem, 100%);
          background: var(--panel);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 0.85rem;
          padding: 1rem 1.1rem 1.05rem;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
        }
        .ko-pron-flashcard-alert__title {
          margin: 0 0 0.45rem;
          font-size: 1.05rem;
        }
        .ko-pron-flashcard-alert__desc {
          margin: 0 0 0.85rem;
          font-size: 0.9rem;
          color: var(--muted);
          line-height: 1.45;
        }
        .ko-pron-flashcard-alert__close {
          display: block;
          width: 100%;
          border: none;
          border-radius: 0.55rem;
          padding: 0.55rem 0.85rem;
          background: #f97316;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>,
    document.body
  );
}
