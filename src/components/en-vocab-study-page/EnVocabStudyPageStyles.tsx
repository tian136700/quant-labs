"use client";

export function EnVocabStudyPageStyles() {
  return (
    <style jsx global>{`

        .jp-vocab-study-page .jp-vocab-scroll-hint {
          margin: 0 0 0.5rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-study-page .jp-vocab-levels {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem 0.5rem;
        }
        .jp-vocab-study-page .jp-vocab-level-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8125rem;
          white-space: nowrap;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text);
          line-height: 1.3;
          min-height: 2rem;
        }
        .jp-vocab-study-page .jp-vocab-check-box {
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
        .jp-vocab-study-page .jp-vocab-level-opt.is-checked .jp-vocab-check-box {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 18%, var(--bg));
        }
        .jp-vocab-study-page .jp-vocab-level-opt--very.is-checked {
          color: var(--fall);
        }
        .jp-vocab-study-page .jp-vocab-level-opt--very.is-checked .jp-vocab-check-box {
          border-color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, var(--bg));
          color: var(--fall);
        }
        .jp-vocab-study-page .jp-vocab-level-opt--weak.is-checked {
          color: var(--rise);
        }
        .jp-vocab-study-page .jp-vocab-level-opt--weak.is-checked .jp-vocab-check-box {
          border-color: var(--rise);
          background: color-mix(in srgb, var(--rise) 18%, var(--bg));
          color: var(--rise);
        }
        .jp-vocab-study-page .jp-vocab-level-opt.is-checked {
          background: rgba(61, 139, 253, 0.08);
        }
        .jp-vocab-study-page .jp-vocab-kind-badge {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
          white-space: nowrap;
        }
        .jp-vocab-study-page .jp-vocab-kind-badge--grammar {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          color: var(--accent);
        }
        .jp-vocab-study-page .jp-vocab-word-link {
          font-weight: 500;
          color: var(--accent);
          text-decoration: underline;
          text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent);
          text-underline-offset: 2px;
          border: none;
          background: transparent;
          padding: 0;
          font: inherit;
          cursor: pointer;
        }
        .jp-vocab-study-page .jp-vocab-word-link:hover {
          text-decoration: underline;
        }
        .jp-vocab-study-page .jp-vocab-word-text {
          font-weight: 500;
        }
        .jp-vocab-study-page .jp-vocab-word-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          min-width: 0;
        }
        .jp-vocab-study-page .jp-vocab-ref-hint {
          display: block;
          margin-top: 0.2rem;
          font-size: 0.75rem;
          color: var(--muted);
          text-align: center;
        }
        .jp-vocab-study-page .jp-vocab-table-wrap {
          display: block;
          width: 100%;
          overflow-x: auto;
          overflow-y: clip;
          -webkit-overflow-scrolling: touch;
        }
        .jp-vocab-study-page .jp-vocab-table {
          width: 100%;
          min-width: 1180px;
        }
        .jp-vocab-study-page .jp-vocab-notes-actions,
        .jp-vocab-study-page .jp-vocab-action-buttons {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
        }
        .jp-vocab-study-page .jp-vocab-table th,
        .jp-vocab-study-page .jp-vocab-table td {
          white-space: normal;
          vertical-align: middle;
          padding: 0.5rem 0.55rem;
          text-align: center;
        }
        .jp-vocab-study-page .jp-vocab-th-multiline {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.05rem;
          line-height: 1.2;
        }
        .jp-vocab-study-page .jp-vocab-th-multiline__sub {
          font-size: 0.8125em;
          color: var(--rise);
        }
        .jp-vocab-study-page .jp-vocab-risk-value {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-study-page .jp-vocab-risk-badge--high {
          color: var(--rise);
        }
        .jp-vocab-study-page .jp-vocab-risk-badge--mid {
          color: var(--accent);
        }
        .jp-vocab-study-page .jp-vocab-risk-badge--low {
          color: var(--fall);
        }
        .jp-vocab-study-page .jp-vocab-stat-detail,
        .jp-vocab-study-page .jp-vocab-stat-total {
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-study-page .jp-vocab-total-never {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.15;
          white-space: normal;
        }
        .jp-vocab-study-page .jp-vocab-today-check-value {
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-study-page .jp-vocab-today-check-value--active {
          color: var(--accent);
          font-weight: 700;
        }
          `}</style>
  );
}
