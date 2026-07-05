"use client";

import { useEffect, useRef, useState } from "react";

export type HalfHourTimeOption = { value: string; label: string };

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
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? "请选择";

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

  return (
    <div ref={rootRef} className="en-lesson- jp-lesson-time-grid-picker">
      <button
        type="button"
        className={`en-lesson- jp-lesson-time-grid-trigger${
          value ? " has-value" : ""
        }${open ? " is-open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selectedLabel}</span>
        <span className="en-lesson- jp-lesson-time-grid-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="en-lesson- jp-lesson-time-grid-panel"
          role="listbox"
          aria-label="选择时间"
        >
          {options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`en-lesson- jp-lesson-time-grid-tile${
                  selected ? " is-selected" : ""
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <style jsx>{`
        .en-lesson- jp-lesson-time-grid-picker {
          position: relative;
        }

        .en-lesson- jp-lesson-time-grid-trigger {
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

        .en-lesson- jp-lesson-time-grid-trigger:not(.has-value) {
          color: var(--muted);
        }

        .en-lesson- jp-lesson-time-grid-trigger.is-open {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        }

        .en-lesson- jp-lesson-time-grid-trigger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .en-lesson- jp-lesson-time-grid-chevron {
          color: var(--muted);
          font-size: 0.75rem;
          line-height: 1;
          transition: transform 0.15s ease;
        }

        .en-lesson- jp-lesson-time-grid-trigger.is-open .en-lesson- jp-lesson-time-grid-chevron {
          transform: rotate(180deg);
        }

        .en-lesson- jp-lesson-time-grid-panel {
          margin-top: 0.45rem;
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          gap: 0.4rem;
          padding: 0.6rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: color-mix(in srgb, var(--bg) 18%, var(--panel));
        }

        .en-lesson- jp-lesson-time-grid-tile {
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

        .en-lesson- jp-lesson-time-grid-tile:hover {
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }

        .en-lesson- jp-lesson-time-grid-tile.is-selected {
          border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
          background: color-mix(in srgb, var(--accent) 16%, var(--panel));
          color: var(--accent);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
