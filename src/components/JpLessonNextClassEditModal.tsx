"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatNextClassHalfHourLabel,
  JP_LESSON_CLASS_DURATION_MINUTES,
  listNextClassHalfHourTimes,
  nextClassAtToDatetimeLocalValue,
  splitNextClassAtLocalValue,
} from "@/lib/jp-lesson-shared";
import type { JpLessonRecord } from "@/lib/types";

type Props = {
  open: boolean;
  lesson: JpLessonRecord | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (nextClassAt: string | null, classDurationMinutes: number | null) => void;
};

const HALF_HOUR_OPTIONS = listNextClassHalfHourTimes();
const DURATION_OPTIONS = JP_LESSON_CLASS_DURATION_MINUTES.map((minutes) => ({
  value: String(minutes),
  label: minutes === 60 ? "1小时" : `${minutes}分钟`,
}));

export function JpLessonNextClassEditModal({
  open,
  lesson,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");
  const [durationValue, setDurationValue] = useState("");

  const timeOptions = useMemo(
    () =>
      HALF_HOUR_OPTIONS.map((value) => ({
        value,
        label: formatNextClassHalfHourLabel(value),
      })),
    []
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !lesson) return;
    const local = nextClassAtToDatetimeLocalValue(lesson.next_class_at);
    if (!local) {
      setDateValue("");
      setTimeValue("");
      setDurationValue("");
      return;
    }
    const parts = splitNextClassAtLocalValue(local);
    if (!parts) {
      setDateValue("");
      setTimeValue("");
      setDurationValue("");
      return;
    }
    setDateValue(parts.date);
    setTimeValue(parts.time);
    setDurationValue(
      lesson.class_duration_minutes != null ? String(lesson.class_duration_minutes) : ""
    );
  }, [open, lesson]);

  const handleSave = () => {
    if (!dateValue.trim() || !timeValue.trim()) {
      onSave(null, null);
      return;
    }
    const durationMinutes = durationValue ? Number(durationValue) : null;
    onSave(`${dateValue}T${timeValue}`, durationMinutes);
  };

  const handleClear = () => {
    setDateValue("");
    setTimeValue("");
    setDurationValue("");
  };

  if (!open || !mounted || !lesson) return null;

  return createPortal(
    <div
      className="jp-lesson-next-class-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="jp-lesson-next-class-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-next-class-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-next-class-header">
          <div>
            <h2 id="jp-lesson-next-class-modal-title">设置上课时间</h2>
            <p className="jp-lesson-next-class-modal-lesson">
              课程 #{lesson.id} · {lesson.content}
            </p>
          </div>
          <button
            type="button"
            className="jp-lesson-next-class-close"
            aria-label="关闭"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <fieldset className="jp-lesson-next-class-fieldset" disabled={saving}>
          <legend>上课时间（北京时间，整点 / 半点）</legend>
          <div className="jp-lesson-next-class-fields">
            <label className="jp-lesson-next-class-field">
              <span>日期</span>
              <input
                type="date"
                className="jp-lesson-next-class-input"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
              />
            </label>
            <label className="jp-lesson-next-class-field">
              <span>时间</span>
              <select
                className="jp-lesson-next-class-input jp-lesson-next-class-time-select"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
              >
                <option value="">请选择</option>
                {timeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="jp-lesson-next-class-hint">
            仅可选整点或半点（如 13 点、13 点半）；留空表示未定义。
          </p>
        </fieldset>

        <fieldset className="jp-lesson-next-class-fieldset" disabled={saving}>
          <legend>上课时长</legend>
          <label className="jp-lesson-next-class-field">
            <span>时长</span>
            <select
              className="jp-lesson-next-class-input jp-lesson-next-class-time-select"
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
            >
              <option value="">请选择</option>
              {DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="jp-lesson-next-class-hint">
            可选 30 分钟、45 分钟、55 分钟或 1 小时；保存后在列表「上课时间」下方显示。
          </p>
        </fieldset>

        <div className="jp-lesson-next-class-actions">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={saving}
            onClick={handleClear}
          >
            清除
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .jp-lesson-next-class-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-lesson-next-class-modal {
          width: min(420px, 100%);
          padding: 1rem 1.1rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-lesson-next-class-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .jp-lesson-next-class-header h2 {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-lesson-next-class-modal-lesson {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.45;
        }

        .jp-lesson-next-class-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-lesson-next-class-fieldset {
          margin: 0 0 0.75rem;
          padding: 0;
          border: none;
        }

        .jp-lesson-next-class-fieldset legend {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-bottom: 0.5rem;
        }

        .jp-lesson-next-class-fields {
          display: grid;
          gap: 0.65rem;
        }

        .jp-lesson-next-class-field {
          display: grid;
          gap: 0.35rem;
        }

        .jp-lesson-next-class-field span {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-next-class-input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font-size: 0.875rem;
        }

        .jp-lesson-next-class-time-select {
          cursor: pointer;
        }

        .jp-lesson-next-class-hint {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .jp-lesson-next-class-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        :global(.jp-lesson-action-btn--primary) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
        }
      `}</style>
    </div>,
    document.body
  );
}
