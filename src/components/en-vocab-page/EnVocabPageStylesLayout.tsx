"use client";

export function EnVocabPageStylesLayout() {
  return (
    <style jsx global>{`

        :global(.page-wrap:has(.jp-vocab-page)) {
          max-width: min(1480px, 96vw);
        }
        .jp-vocab-scroll-hint {
          display: none;
          margin: 0 0 0.5rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-today-summary-value {
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }
        .jp-vocab-today-summary-value--active {
          color: var(--accent);
          font-weight: 700;
        }
        .jp-vocab-help {
          margin-bottom: 0.75rem;
        }
        .jp-vocab-help-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--muted);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .jp-vocab-help-toggle:hover {
          color: var(--accent);
        }
        .jp-vocab-help-toggle-icon {
          font-size: 0.625rem;
          opacity: 0.7;
        }
        .jp-vocab-risk-hint {
          margin: 0.5rem 0 0;
          padding: 0.65rem 0.85rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
          font-size: 0.8125rem;
          line-height: 1.55;
          color: var(--muted);
        }
        .jp-vocab-risk-hint p {
          margin: 0 0 0.65rem;
        }
        .jp-vocab-risk-hint p:last-child {
          margin-bottom: 0;
        }
        .jp-vocab-risk-hint strong {
          color: var(--text);
        }
        .jp-vocab-search {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 0.65rem;
          margin: 0 0 0.75rem;
        }
        .jp-vocab-search__label {
          font-size: 0.875rem;
          color: var(--muted);
          flex-shrink: 0;
        }
        .jp-vocab-search__row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex: 1 1 auto;
          min-width: 0;
          max-width: 24rem;
        }
        .jp-vocab-search__kind {
          flex: 0 0 auto;
          width: 3.4rem;
          min-width: 3.4rem;
          padding: 0.45rem 1.15rem 0.45rem 0.35rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background-color: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%),
            linear-gradient(135deg, var(--muted) 50%, transparent 50%);
          background-position:
            calc(100% - 0.55rem) calc(50% + 0.12rem),
            calc(100% - 0.35rem) calc(50% + 0.12rem);
          background-size: 0.3rem 0.3rem;
          background-repeat: no-repeat;
          text-align: center;
          text-align-last: center;
        }
        .jp-vocab-search__kind:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .jp-vocab-search__kind:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .jp-vocab-search__input {
          flex: 1 1 auto;
          min-width: 0;
          width: auto;
          max-width: none;
          padding: 0.45rem 0.65rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
        }
        .jp-vocab-search__input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .jp-vocab-search__input:disabled {
          opacity: 0.6;
        }
        .jp-vocab-search__meta {
          font-size: 0.8125rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-search__empty {
          margin: 0 0 0.75rem;
          padding: 0.65rem 0.85rem;
          border-radius: 6px;
          border: 1px dashed var(--border);
          color: var(--muted);
          font-size: 0.875rem;
        }
        .jp-vocab-pagination {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.45rem;
          margin: 0 0 0.75rem;
        }
        .jp-vocab-pagination:last-of-type {
          margin: 0.75rem 0 0;
        }
        .jp-vocab-pagination__controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-start;
          gap: 0.65rem 0.85rem;
          width: 100%;
        }
        .jp-vocab-pagination__info {
          font-size: 0.8125rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          text-align: left;
        }
        .jp-vocab-pagination__size {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-pagination__size-label {
          white-space: nowrap;
        }
        .jp-vocab-pagination__size-select {
          min-width: 4.5rem;
          padding: 0.35rem 1.25rem 0.35rem 0.45rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background-color: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.8125rem;
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-pagination__size-select:focus {
          outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
          outline-offset: 1px;
        }
        .jp-vocab-level-unavailable {
          display: inline-block;
          font-size: 0.75rem;
          line-height: 1.35;
          color: var(--muted);
        }
        .jp-vocab-level-card-entry {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.3rem;
          width: 100%;
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        .jp-vocab-level-card-entry:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-vocab-levels--readonly {
          pointer-events: none;
        }
        .jp-vocab-levels {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem 0.5rem;
          min-width: 0;
        }
        .jp-vocab-level-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8125rem;
          cursor: pointer;
          white-space: nowrap;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text);
          font: inherit;
          line-height: 1.3;
          min-height: 2rem;
        }
        .jp-vocab-check-box {
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
        .jp-vocab-level-opt.is-checked .jp-vocab-check-box {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 18%, var(--bg));
        }
        .jp-vocab-level-opt--very.is-checked {
          color: var(--fall);
        }
        .jp-vocab-level-opt--very.is-checked .jp-vocab-check-box {
          border-color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, var(--bg));
          color: var(--fall);
        }
        .jp-vocab-level-opt--weak.is-checked {
          color: var(--rise);
        }
        .jp-vocab-level-opt--weak.is-checked .jp-vocab-check-box {
          border-color: var(--rise);
          background: color-mix(in srgb, var(--rise) 18%, var(--bg));
          color: var(--rise);
        }
        .jp-vocab-level-opt.is-checked {
          background: rgba(61, 139, 253, 0.08);
        }
        .jp-vocab-level-opt:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.04);
        }
        .jp-vocab-level-opt:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-vocab-level-opt--readonly:disabled {
          opacity: 0.72;
        }
        .jp-vocab-kind-badge {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
          white-space: nowrap;
        }
        .jp-vocab-kind-badge--grammar {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, transparent);
        }
        .jp-vocab-ref-hint {
          display: block;
          margin-left: 0;
          margin-top: 0.2rem;
          font-size: 0.75rem;
          color: var(--muted);
          text-align: center;
        }
        .jp-vocab-word-link {
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
        .jp-vocab-word-link:hover {
          text-decoration: underline;
        }
        .jp-vocab-word-text {
          font-weight: 500;
        }
        .jp-vocab-word-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          flex: 1;
          min-width: 0;
        }
        :global(.jp-vocab-table-wrap) {
          display: block;
          width: 100%;
          overflow-x: auto;
          overflow-y: clip;
          -webkit-overflow-scrolling: touch;
        }
        /* 对齐日语：fixed + 操作列 sticky；桌面下限宽度避免列被压到叠字（可横滑） */
        :global(.jp-vocab-table) {
          width: 100%;
          table-layout: fixed;
          min-width: 68rem;
        }
        :global(.jp-vocab-table th),
        :global(.jp-vocab-table td) {
          white-space: normal;
          vertical-align: middle;
          padding: 0.4rem 0.35rem;
          text-align: center;
          overflow: hidden;
        }
        :global(.jp-vocab-table thead th) {
          font-size: 0.8125rem;
          line-height: 1.3;
          overflow: hidden;
        }
        :global(.jp-vocab-table .jp-vocab-th-multiline) {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.05rem;
          line-height: 1.2;
          max-width: 100%;
        }
        :global(.jp-vocab-table .jp-vocab-th-multiline--compact) {
          font-size: 0.8125rem;
        }
        :global(.jp-vocab-table .jp-vocab-th-multiline__sub) {
          font-size: 0.8125em;
          color: var(--rise);
        }
        :global(.jp-vocab-table .jp-vocab-select-col) {
          width: 2.5%;
          min-width: 0;
          text-align: center;
          padding-left: 0.35rem;
          padding-right: 0.35rem;
        }
        :global(.jp-vocab-select-checkbox) {
          width: 1rem;
          height: 1rem;
          margin: 0;
          cursor: pointer;
          accent-color: var(--accent);
        }
        :global(.jp-vocab-select-checkbox:disabled) {
          cursor: not-allowed;
          opacity: 0.55;
        }
        :global(.jp-vocab-table .jp-vocab-seq-col),
        :global(.jp-vocab-table .jp-vocab-kind-col),
        :global(.jp-vocab-table .en-vocab-category-col),
        :global(.jp-vocab-table .en-vocab-upload-source-col),
        :global(.jp-vocab-table .jp-vocab-risk-col),
        :global(.jp-vocab-table .jp-vocab-stats-col),
        :global(.jp-vocab-table .jp-vocab-today-check-col),
        :global(.jp-vocab-table .jp-vocab-updated-col),
        :global(.jp-vocab-table .jp-vocab-notes-col),
        :global(.jp-vocab-table .jp-vocab-action-col) {
          padding-left: 0.35rem;
          padding-right: 0.35rem;
        }
        :global(.jp-vocab-table .jp-vocab-level-col) {
          text-align: center;
          width: 11%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-stats-col) {
          text-align: center;
          vertical-align: middle;
          width: 9%;
          min-width: 6.25rem;
        }
        .jp-vocab-stats-col-head {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.35rem;
        }
        .jp-vocab-stats-col__title {
          display: block;
          font-size: 0.8125rem;
          font-weight: 600;
          line-height: 1.25;
        }
        .jp-vocab-stats-sort-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.2rem 0.35rem;
        }
        .jp-vocab-stats-sort-btn {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.05rem;
          min-width: 0;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          font-size: 0.6875rem;
          line-height: 1.2;
          cursor: pointer;
          padding: 0.1rem 0;
        }
        .jp-vocab-stats-sort-btn:hover {
          color: var(--accent);
        }
        .jp-vocab-stats-sort-btn__label {
          min-width: 0;
          white-space: nowrap;
        }
        .jp-vocab-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.28rem 0.35rem;
          width: 100%;
          font-size: 0.75rem;
          line-height: 1.25;
          font-variant-numeric: tabular-nums;
          justify-items: center;
          align-items: center;
        }
        .jp-vocab-stats-grid__item {
          min-width: 0;
          text-align: center;
        }
        .jp-vocab-stats-grid__item--very {
          color: var(--fall);
        }
        .jp-vocab-stats-grid__item--weak {
          color: var(--rise);
        }
        .jp-vocab-stats-grid__item--total {
          font-weight: 600;
          white-space: normal;
          line-height: 1.2;
          font-size: 0.6875rem;
          word-break: keep-all;
        }
        .jp-vocab-stats-grid__item--total :global(.jp-vocab-total-never) {
          font-weight: 500;
        }
        :global(.jp-vocab-table .jp-vocab-sort-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.15rem;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          font-size: inherit;
          cursor: pointer;
          padding: 0;
        }
        :global(.jp-vocab-table .jp-vocab-sort-btn:hover) {
          color: var(--accent);
        }
        :global(.jp-vocab-table .jp-vocab-sort-indicator) {
          font-size: 0.6875rem;
          opacity: 0.45;
          line-height: 1;
        }
        :global(.jp-vocab-table .jp-vocab-sort-btn[aria-sort="ascending"] .jp-vocab-sort-indicator),
        :global(.jp-vocab-table .jp-vocab-sort-btn[aria-sort="descending"] .jp-vocab-sort-indicator) {
          opacity: 1;
          color: var(--accent);
        }
        :global(.jp-vocab-table .jp-vocab-seq-col),
        :global(.jp-vocab-table .jp-vocab-kind-col),
        :global(.jp-vocab-table .en-vocab-category-col),
        :global(.jp-vocab-table .en-vocab-upload-source-col),
        :global(.jp-vocab-table .jp-vocab-reading-col),
        :global(.jp-vocab-table .jp-vocab-meaning-col),
        :global(.jp-vocab-table .jp-vocab-pos-col),
        :global(.jp-vocab-table .jp-vocab-risk-col),
        :global(.jp-vocab-table .jp-vocab-stats-col) {
          text-align: center;
        }
        /* 对齐日语：桌面隐藏「展开操作」；工具栏横排 */
        .jp-vocab-mobile-only {
          display: none;
        }
        .jp-vocab-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          justify-content: flex-end;
        }
        .jp-vocab-toolbar-summary {
          flex: 1 1 auto;
          min-width: 0;
        }
        .jp-vocab-toolbar-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
    `}</style>
  );
}
