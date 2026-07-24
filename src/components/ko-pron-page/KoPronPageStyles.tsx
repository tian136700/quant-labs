"use client";

export function KoPronPageStyles() {
  return (
    <style jsx>{`

        .ko-pron-page {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1rem 1rem 2.5rem;
          color: var(--text);
        }
        .ko-pron-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem 1rem;
          margin-bottom: 0.85rem;
        }
        .ko-pron-title {
          margin: 0;
          font-size: 1.35rem;
          color: var(--text);
        }
        .ko-pron-toolbar-stats {
          display: flex;
          gap: 0.85rem;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .ko-pron-start-btn,
        .ko-pron-preview-btn {
          border: none;
          border-radius: 0.55rem;
          background: #f97316;
          color: #fff;
          font-weight: 600;
          padding: 0.45rem 0.85rem;
          cursor: pointer;
        }
        .ko-pron-start-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .ko-pron-error {
          color: #f87171;
        }
        .ko-pron-empty-pool {
          border: 1px dashed var(--border);
          border-radius: 0.85rem;
          padding: 1.25rem 1rem;
          background: var(--panel);
          color: var(--muted);
          line-height: 1.55;
          margin: 0.75rem 0 1rem;
        }
        .ko-pron-empty-pool p {
          margin: 0 0 0.75rem;
        }
        .ko-pron-empty-pool__link {
          color: color-mix(in srgb, var(--accent) 70%, #fdba74);
          font-weight: 600;
          text-decoration: none;
        }
        .ko-pron-empty-pool__link:hover {
          text-decoration: underline;
        }
        .ko-pron-status {
          color: var(--muted);
        }
        .ko-pron-search {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 0.65rem;
          margin: 0.85rem 0 0.65rem;
        }
        .ko-pron-search__label {
          font-size: 0.875rem;
          color: var(--muted);
          flex-shrink: 0;
        }
        .ko-pron-search__row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex: 1 1 auto;
          min-width: 0;
          max-width: 28rem;
        }
        .ko-pron-search__category {
          flex: 0 0 auto;
          min-width: 6.5rem;
          padding: 0.45rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .ko-pron-search__category option {
          background: var(--panel);
          color: var(--text);
        }
        .ko-pron-search__category:focus,
        .ko-pron-search__input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
        }
        .ko-pron-search__input {
          flex: 1 1 auto;
          min-width: 0;
          padding: 0.45rem 0.65rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
        }
        .ko-pron-search__input::placeholder {
          color: var(--muted);
        }
        .ko-pron-search__clear {
          border: 1px solid var(--border);
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 45%, var(--panel));
          color: var(--text);
          font-size: 0.8125rem;
          padding: 0.35rem 0.65rem;
          cursor: pointer;
        }
        .ko-pron-search__meta {
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .ko-pron-search__empty {
          margin: 0.5rem 0 0;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .ko-pron-table-wrap {
          overflow-x: auto;
          overflow-y: clip;
          margin-top: 0.35rem;
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          background: var(--panel);
        }
        .ko-pron-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92rem;
          color: var(--text);
        }
        .ko-pron-table th,
        .ko-pron-table td {
          padding: 0.55rem 0.65rem;
          border-bottom: 1px solid var(--border);
          text-align: left;
          vertical-align: middle;
          color: var(--text);
          background: transparent;
        }
        .ko-pron-table th {
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          font-weight: 600;
          color: var(--muted);
        }
        .ko-pron-th-stack {
          display: inline-flex;
          flex-direction: column;
          line-height: 1.15;
          gap: 0.1rem;
        }
        .ko-pron-th-sub {
          font-size: 0.7rem;
          font-weight: 500;
          color: var(--muted);
        }
        .ko-pron-letter-cell {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 1.35rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .ko-pron-letter-glyph {
          vertical-align: middle;
        }
        .ko-pron-mobile-reading-row {
          display: none;
        }
        .ko-pron-stats-cell {
          font-variant-numeric: tabular-nums;
          color: var(--muted);
          white-space: nowrap;
        }
        .ko-pron-stats-cell span[aria-hidden="true"] {
          margin: 0 0.15rem;
          color: var(--border);
        }
        .ko-pron-risk-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.125rem 0.4375rem;
          border-radius: 999px;
          font-size: 0.8125rem;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 40%, var(--panel));
          color: var(--text);
        }
        .ko-pron-risk-badge--low {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 40%, var(--border));
          background: color-mix(in srgb, var(--fall) 12%, var(--panel));
        }
        .ko-pron-risk-badge--mid {
          color: #fdba74;
          border-color: color-mix(in srgb, #f97316 40%, var(--border));
          background: color-mix(in srgb, #f97316 14%, var(--panel));
        }
        .ko-pron-risk-badge--high {
          color: var(--rise);
          border-color: color-mix(in srgb, var(--rise) 40%, var(--border));
          background: color-mix(in srgb, var(--rise) 12%, var(--panel));
        }
        .ko-pron-risk-badge--never {
          color: var(--muted);
          font-weight: 500;
        }
        .ko-pron-row--clickable {
          cursor: pointer;
        }
        .ko-pron-row--clickable:hover {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
          `}</style>
  );
}
