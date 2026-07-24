"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatNextClassHalfHourLabel,
  normalizeNextClassTimeHm,
} from "@/lib/jp-lesson-shared";

export type HalfHourTimeOption = { value: string; label: string };

/** 默认隐藏 0:00–6:30，7:00 起正常展示 */
const EARLY_MORNING_CUTOFF_HOUR = 7;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0")
);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0")
);

function isEarlyMorningHalfHourTime(time: string): boolean {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  return Number(match[1]) < EARLY_MORNING_CUTOFF_HOUR;
}

function splitTimeHm(time: string): { hour: string; minute: string } {
  const normalized = normalizeNextClassTimeHm(time);
  if (!normalized) return { hour: "09", minute: "00" };
  const [hour, minute] = normalized.split(":");
  return { hour, minute };
}

type Props = {
  value: string;
  options: HalfHourTimeOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function JpLessonHalfHourTimeGridPicker({
  value,
  options,
  disabled,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showEarlyMorning, setShowEarlyMorning] = useState(false);
  const [customHour, setCustomHour] = useState("09");
  const [customMinute, setCustomMinute] = useState("00");
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = value
    ? options.find((option) => option.value === value)?.label ??
      formatNextClassHalfHourLabel(value)
    : "请选择";

  const { earlyOptions, regularOptions } = useMemo(() => {
    const early: HalfHourTimeOption[] = [];
    const regular: HalfHourTimeOption[] = [];
    for (const option of options) {
      if (isEarlyMorningHalfHourTime(option.value)) {
        early.push(option);
      } else {
        regular.push(option);
      }
    }
    return { earlyOptions: early, regularOptions: regular };
  }, [options]);

  useEffect(() => {
    if (!open) {
      setShowEarlyMorning(false);
      return;
    }
    const parts = splitTimeHm(value);
    setCustomHour(parts.hour);
    setCustomMinute(parts.minute);
    if (value && isEarlyMorningHalfHourTime(value)) {
      setShowEarlyMorning(true);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const applyCustomTime = () => {
    const normalized = normalizeNextClassTimeHm(`${customHour}:${customMinute}`);
    if (!normalized) return;
    onChange(normalized);
    setOpen(false);
  };

  const renderTimeTile = (option: HalfHourTimeOption) => {
    const selected = value === option.value;
    return (
      <button
        key={option.value}
        type="button"
        role="option"
        aria-selected={selected}
        className={`jp-lesson-time-grid-tile${selected ? " is-selected" : ""}`}
        onClick={() => {
          onChange(option.value);
          setOpen(false);
        }}
      >
        {option.label}
      </button>
    );
  };

  return (
    <div ref={rootRef} className="jp-lesson-time-grid-picker">
      <button
        type="button"
        className={`jp-lesson-time-grid-trigger${
          value ? " has-value" : ""
        }${open ? " is-open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selectedLabel}</span>
        <span className="jp-lesson-time-grid-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="jp-lesson-time-grid-panel"
          role="listbox"
          aria-label="选择时间"
        >
          {!showEarlyMorning && earlyOptions.length > 0 ? (
            <button
              type="button"
              className="jp-lesson-time-grid-early-toggle"
              onClick={() => setShowEarlyMorning(true)}
            >
              展开凌晨时段（0:00–6:30）
            </button>
          ) : null}
          {showEarlyMorning ? earlyOptions.map(renderTimeTile) : null}
          {showEarlyMorning && earlyOptions.length > 0 ? (
            <button
              type="button"
              className="jp-lesson-time-grid-early-toggle jp-lesson-time-grid-early-toggle--collapse"
              onClick={() => setShowEarlyMorning(false)}
            >
              收起凌晨时段
            </button>
          ) : null}
          {regularOptions.map(renderTimeTile)}
          <div
            className="jp-lesson-time-grid-custom"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="jp-lesson-time-grid-custom-label">自定义时间</span>
            <div className="jp-lesson-time-grid-custom-row">
              <label className="jp-lesson-time-grid-custom-field">
                <span className="jp-lesson-time-grid-custom-field-label">时</span>
                <select
                  className="jp-lesson-time-grid-custom-select"
                  value={customHour}
                  aria-label="小时"
                  onChange={(e) => setCustomHour(e.target.value)}
                >
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {Number(hour)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="jp-lesson-time-grid-custom-colon" aria-hidden>
                :
              </span>
              <label className="jp-lesson-time-grid-custom-field">
                <span className="jp-lesson-time-grid-custom-field-label">分</span>
                <select
                  className="jp-lesson-time-grid-custom-select"
                  value={customMinute}
                  aria-label="分钟"
                  onChange={(e) => setCustomMinute(e.target.value)}
                >
                  {MINUTE_OPTIONS.map((minute) => (
                    <option key={minute} value={minute}>
                      {minute}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="jp-lesson-time-grid-custom-apply"
                onClick={applyCustomTime}
              >
                使用
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .jp-lesson-time-grid-picker {
          position: relative;
        }

        .jp-lesson-time-grid-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          width: 100%;
          box-sizing: border-box;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font-size: 0.875rem;
          cursor: pointer;
          text-align: left;
        }

        .jp-lesson-time-grid-trigger:not(.has-value) {
          color: var(--muted);
        }

        .jp-lesson-time-grid-trigger.is-open {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        }

        .jp-lesson-time-grid-trigger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .jp-lesson-time-grid-chevron {
          color: var(--muted);
          font-size: 0.75rem;
          line-height: 1;
          transition: transform 0.15s ease;
        }

        .jp-lesson-time-grid-trigger.is-open .jp-lesson-time-grid-chevron {
          transform: rotate(180deg);
        }

        .jp-lesson-time-grid-panel {
          margin-top: 0.45rem;
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          gap: 0.4rem;
          padding: 0.6rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: color-mix(in srgb, var(--bg) 18%, var(--panel));
        }

        .jp-lesson-time-grid-tile {
          display: flex;
          align-items: center;
          justify-content: center;
          aspect-ratio: 1;
          min-height: 2.35rem;
          padding: 0.15rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font-size: 0.75rem;
          line-height: 1.1;
          text-align: center;
          cursor: pointer;
          transition:
            border-color 0.12s ease,
            background 0.12s ease,
            color 0.12s ease;
        }

        .jp-lesson-time-grid-tile:hover {
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }

        .jp-lesson-time-grid-tile.is-selected {
          border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
          background: color-mix(in srgb, var(--accent) 16%, var(--panel));
          color: var(--accent);
          font-weight: 600;
        }

        .jp-lesson-time-grid-early-toggle {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 2rem;
          padding: 0.35rem 0.5rem;
          border: 1px dashed color-mix(in srgb, var(--border) 85%, var(--muted));
          border-radius: 8px;
          background: transparent;
          color: var(--muted);
          font-size: 0.75rem;
          line-height: 1.3;
          cursor: pointer;
        }

        .jp-lesson-time-grid-early-toggle:hover {
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          color: var(--accent);
        }

        .jp-lesson-time-grid-early-toggle--collapse {
          margin-bottom: 0.1rem;
        }

        .jp-lesson-time-grid-custom {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin-top: 0.15rem;
          padding-top: 0.55rem;
          border-top: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
        }

        .jp-lesson-time-grid-custom-label {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-lesson-time-grid-custom-row {
          display: flex;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 0.4rem;
        }

        .jp-lesson-time-grid-custom-field {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          min-width: 4.5rem;
        }

        .jp-lesson-time-grid-custom-field-label {
          font-size: 0.6875rem;
          color: var(--muted);
        }

        .jp-lesson-time-grid-custom-select {
          min-height: 2.35rem;
          padding: 0.35rem 0.45rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font: inherit;
          font-variant-numeric: tabular-nums;
        }

        .jp-lesson-time-grid-custom-colon {
          align-self: center;
          padding-bottom: 0.35rem;
          font-weight: 600;
          color: var(--muted);
        }

        .jp-lesson-time-grid-custom-apply {
          min-height: 2.35rem;
          padding: 0.35rem 0.85rem;
          border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
          border-radius: 8px;
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
          font: inherit;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
        }

        .jp-lesson-time-grid-custom-apply:hover {
          background: color-mix(in srgb, var(--accent) 22%, var(--panel));
        }

        @media (max-width: 767px) {
          .jp-lesson-time-grid-trigger {
            min-height: 2.75rem;
            padding: 0.65rem 0.75rem;
            font-size: 1rem;
          }

          .jp-lesson-time-grid-panel {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0.5rem;
            padding: 0.75rem;
          }

          .jp-lesson-time-grid-tile {
            aspect-ratio: auto;
            min-height: 2.75rem;
            padding: 0.4rem 0.3rem;
            font-size: 0.9375rem;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
          }

          .jp-lesson-time-grid-early-toggle {
            min-height: 2.5rem;
            padding: 0.5rem 0.65rem;
            font-size: 0.8125rem;
          }

          .jp-lesson-time-grid-custom-select,
          .jp-lesson-time-grid-custom-apply {
            min-height: 2.75rem;
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
