"use client";

import { useEffect, useState } from "react";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  JP_VOCAB_QUIZ_TIME_WEIGHT_PRESETS,
  normalizeJpVocabQuizTimeWeight,
} from "@/lib/jp-vocab-quiz-score";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
  jpVocabSaveProgressPercent,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
} from "@/lib/jp-vocab-save-progress";

type Props = {
  value: number;
  saving: boolean;
  onSave: (weight: number) => Promise<boolean>;
};

/**
 * 管理员：久未复习抬升权重（final_score = priority + days × weight）。
 * 改完次日凌晨或「今日重置」后重排生效。
 */
export function JpVocabQuizTimeWeightAdmin({ value, saving, onSave }: Props) {
  const [draft, setDraft] = useState(String(value));
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!saving) {
      setDraft(String(value));
    }
  }, [value, saving]);

  const normalizedDraft = normalizeJpVocabQuizTimeWeight(draft);
  const unchanged = normalizedDraft === normalizeJpVocabQuizTimeWeight(value);

  const handleSave = async () => {
    if (saving || unchanged) return;
    const startedAt = Date.now();
    setProgressPercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
    const timer = window.setInterval(() => {
      setProgressPercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
    }, 200);
    setAnimating(true);
    try {
      const ok = await onSave(normalizedDraft);
      if (ok) {
        await animateJpVocabSaveProgressTo100(startedAt, setProgressPercent);
      }
    } finally {
      window.clearInterval(timer);
      setProgressPercent(null);
      setAnimating(false);
    }
  };

  return (
    <div className="jp-vocab-time-weight-admin">
      <div className="jp-vocab-time-weight-admin__row">
        <span className="jp-vocab-time-weight-admin__label">久未复习抬升权重</span>
        <div className="jp-vocab-time-weight-admin__presets" role="group" aria-label="时间权重预设">
          {JP_VOCAB_QUIZ_TIME_WEIGHT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`btn-rsi-filter btn-rsi-filter--compact${
                normalizeJpVocabQuizTimeWeight(draft) === preset
                  ? " btn-rsi-filter--primary"
                  : ""
              }`}
              disabled={saving}
              onClick={() => setDraft(String(preset))}
            >
              {preset}
            </button>
          ))}
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="jp-vocab-time-weight-admin__input"
          value={draft}
          disabled={saving}
          aria-label="时间权重"
          onChange={(e) => {
            const next = e.target.value.trim();
            if (next === "" || /^\d*\.?\d*$/.test(next)) {
              setDraft(next === "" ? "" : next);
            }
          }}
          onBlur={() => {
            if (draft.trim() === "") {
              setDraft(String(JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT));
              return;
            }
            setDraft(String(normalizeJpVocabQuizTimeWeight(draft)));
          }}
        />
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
          disabled={saving || unchanged || draft.trim() === ""}
          onClick={() => void handleSave()}
        >
          {saving ? "保存中…" : "保存权重"}
        </button>
      </div>
      <p className="jp-vocab-time-weight-admin__hint">
        最终抽问得分 = 抽查优先级 + 距上次抽问天数 × 权重（当前{" "}
        {normalizeJpVocabQuizTimeWeight(value)}）。改权重后于次日凌晨或「今日重置」重排生效，不打断当天抽查池。
      </p>
      {saving || animating || progressPercent != null ? (
        <JpVocabSaveProgressBar
          label={jpVocabSaveProgressLabel("save", {
            queued: saving && (progressPercent ?? 0) <= JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
          })}
          percent={
            animating && progressPercent != null
              ? progressPercent
              : jpVocabSaveProgressDisplayPercent(progressPercent)
          }
          fullWidth
        />
      ) : null}
      <style jsx>{`
        .jp-vocab-time-weight-admin {
          margin: 0.65rem 0 0.85rem;
          padding: 0.65rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--panel) 92%, var(--muted) 8%);
        }
        .jp-vocab-time-weight-admin__row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem 0.55rem;
        }
        .jp-vocab-time-weight-admin__label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
          margin-right: 0.15rem;
        }
        .jp-vocab-time-weight-admin__presets {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .jp-vocab-time-weight-admin__input {
          width: 4.5rem;
          min-height: 2rem;
          padding: 0.2rem 0.45rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font-size: 0.875rem;
        }
        .jp-vocab-time-weight-admin__hint {
          margin: 0.45rem 0 0;
          font-size: 0.78rem;
          line-height: 1.45;
          color: var(--muted);
        }
        @media (max-width: 768px) {
          .jp-vocab-time-weight-admin__input {
            width: 100%;
            max-width: 8rem;
          }
        }
      `}</style>
    </div>
  );
}
