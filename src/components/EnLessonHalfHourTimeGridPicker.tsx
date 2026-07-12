"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type HalfHourTimeOption = { value: string; label: string };

/** 默认隐藏 0:00–6:30，7:00 起正常展示 */
const EARLY_MORNING_CUTOFF_HOUR = 7;

function isEarlyMorningHalfHourTime(time: string): boolean {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  return Number(match[1]) < EARLY_MORNING_CUTOFF_HOUR;
}

type Props = {
  value: string;
  options: HalfHourTimeOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function EnLessonHalfHourTimeGridPicker({
  value,
  options,
  disabled,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showEarlyMorning, setShowEarlyMorning] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? "请选择";

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
        }
      `}</style>
    </div>
  );
}
