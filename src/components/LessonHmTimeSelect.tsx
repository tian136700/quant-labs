"use client";

import { useMemo } from "react";
import { normalizeNextClassTimeHm } from "@/lib/jp-lesson-shared";

/** 凌晨 0–5 点极少上课，下拉里单独分组 */
const EARLY_MORNING_HOURS = [0, 1, 2, 3, 4, 5] as const;
const REGULAR_HOURS = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
] as const;

/** 常用分钟：5 分钟一档（含 1:15、6:40 这类） */
const BASE_MINUTE_OPTIONS = [
  "00",
  "05",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function splitTimeHm(time: string): { hour: string; minute: string } | null {
  const normalized = normalizeNextClassTimeHm(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":");
  return { hour, minute };
}

export type LessonHmTimeSelectProps = {
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
  /**
   * 兼容旧半点网格调用方；已忽略。
   * @deprecated
   */
  options?: Array<{ value: string; label: string }>;
};

/**
 * 上课/日程时间：左选整点小时、右选分钟（00/05/10/…/55，5 分钟一档）。
 * 禁止秒；非法/空值不吸附半点。
 */
export function LessonHmTimeSelect({
  value,
  disabled,
  invalid = false,
  onChange,
}: LessonHmTimeSelectProps) {
  const parts = useMemo(() => splitTimeHm(value), [value]);
  const hour = parts?.hour ?? "";
  const minute = parts?.minute ?? "";

  const minuteOptions = useMemo(() => {
    const set = new Set<string>(BASE_MINUTE_OPTIONS);
    if (minute && !set.has(minute)) set.add(minute);
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [minute]);

  const commit = (nextHour: string, nextMinute: string) => {
    if (!nextHour || !nextMinute) return;
    const normalized = normalizeNextClassTimeHm(`${nextHour}:${nextMinute}`);
    if (!normalized) return;
    onChange(normalized);
  };

  return (
    <div
      className={`lesson-hm-time-select${invalid ? " lesson-hm-time-select--invalid" : ""}`}
    >
      <label className="lesson-hm-time-select__field">
        <span className="lesson-hm-time-select__field-label">时</span>
        <select
          className="lesson-hm-time-select__select"
          value={hour}
          disabled={disabled}
          aria-label="小时"
          onChange={(e) => {
            const nextHour = e.target.value;
            if (!nextHour) {
              onChange("");
              return;
            }
            commit(nextHour, minute || "00");
          }}
        >
          <option value="">时</option>
          <optgroup label="常用">
            {REGULAR_HOURS.map((h) => (
              <option key={h} value={pad2(h)}>
                {h} 点
              </option>
            ))}
          </optgroup>
          <optgroup label="凌晨（少用）">
            {EARLY_MORNING_HOURS.map((h) => (
              <option key={h} value={pad2(h)}>
                {h} 点
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <span className="lesson-hm-time-select__colon" aria-hidden>
        :
      </span>
      <label className="lesson-hm-time-select__field">
        <span className="lesson-hm-time-select__field-label">分</span>
        <select
          className="lesson-hm-time-select__select"
          value={minute}
          disabled={disabled}
          aria-label="分钟"
          onChange={(e) => {
            const nextMinute = e.target.value;
            if (!nextMinute) {
              onChange("");
              return;
            }
            commit(hour || "09", nextMinute);
          }}
        >
          <option value="">分</option>
          {minuteOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <style jsx>{`
        .lesson-hm-time-select {
          display: flex;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 0.4rem;
          width: 100%;
        }

        .lesson-hm-time-select__field {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          flex: 1 1 5.5rem;
          min-width: 5rem;
        }

        .lesson-hm-time-select__field-label {
          font-size: 0.6875rem;
          color: var(--muted);
        }

        .lesson-hm-time-select__select {
          width: 100%;
          box-sizing: border-box;
          min-height: 2.35rem;
          padding: 0.35rem 0.45rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font: inherit;
          font-variant-numeric: tabular-nums;
        }

        .lesson-hm-time-select--invalid .lesson-hm-time-select__select {
          border-color: #ff7b7b;
          box-shadow: 0 0 0 1px color-mix(in srgb, #ff7b7b 55%, transparent);
        }

        .lesson-hm-time-select__select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .lesson-hm-time-select__colon {
          align-self: center;
          padding-bottom: 0.35rem;
          font-weight: 600;
          color: var(--muted);
        }

        @media (max-width: 767px) {
          .lesson-hm-time-select__select {
            min-height: 2.75rem;
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
