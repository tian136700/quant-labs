"use client";

export function JpVocabPageStyles() {
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
        .jp-vocab-today-summary-value--never {
          color: color-mix(in srgb, var(--rise) 75%, var(--text));
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
        .jp-vocab-level-wrap {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          max-width: 100%;
        }
        .jp-vocab-level-sync-hint {
          max-width: 8.75rem;
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
        .jp-vocab-level-unavailable {
          display: inline-block;
          font-size: 0.8125rem;
          color: var(--muted);
          opacity: 0.72;
          white-space: nowrap;
          user-select: none;
          pointer-events: none;
        }
        .jp-vocab-levels--locked {
          opacity: 0.78;
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
        .jp-vocab-level-card-entry:not(:disabled):hover .jp-vocab-level-card-entry-hint {
          color: var(--accent);
        }
        .jp-vocab-level-card-entry-hint {
          font-size: 0.6875rem;
          line-height: 1.35;
          color: var(--muted);
          text-align: center;
        }
        .jp-vocab-levels--readonly {
          pointer-events: none;
        }
        .jp-vocab-level-opt--locked:disabled {
          cursor: not-allowed;
          opacity: 1;
        }
        .jp-vocab-levels--locked .jp-vocab-level-opt--locked:disabled:not(.is-checked) {
          opacity: 0.55;
        }
        .jp-vocab-share-btn--locked:disabled {
          opacity: 0.42;
          cursor: not-allowed;
          filter: grayscale(0.45);
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
        .jp-vocab-pos-badge {
          display: inline-block;
          box-sizing: border-box;
          max-width: 5em;
          font-size: 0.75rem;
          padding: 0.2rem 0.35rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          color: var(--muted);
          white-space: normal;
          word-break: break-all;
          overflow-wrap: anywhere;
          line-height: 1.35;
          text-align: center;
          vertical-align: middle;
          background: color-mix(in srgb, var(--panel) 88%, var(--bg));
        }
        .jp-vocab-mobile-only {
          display: none;
        }
        .jp-vocab-level-history {
          display: none;
        }
        @media (min-width: 769px) {
          :global(.jp-vocab-table .jp-vocab-level-history) {
            display: none !important;
          }
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
        .jp-vocab-mobile-sort {
          display: none;
        }
        .jp-vocab-mobile-reading-row {
          display: none;
        }
        .jp-vocab-meaning-desktop {
          display: inline;
        }
        .jp-vocab-meaning-fold {
          display: none;
        }
        .jp-vocab-notes-desktop {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .jp-vocab-action-row {
          display: contents;
        }
        .jp-vocab-action-buttons .jp-vocab-mobile-action-btn svg,
        .jp-vocab-notes-actions .jp-vocab-mobile-action-btn svg {
          display: none;
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
          -webkit-overflow-scrolling: touch;
        }
        :global(.jp-vocab-table) {
          width: 100%;
          table-layout: fixed;
          min-width: 0;
        }
        :global(.jp-vocab-table th),
        :global(.jp-vocab-table td) {
          white-space: normal;
          vertical-align: middle;
          padding: 0.4rem 0.35rem;
          text-align: center;
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
        :global(.jp-vocab-table .jp-vocab-seq-col),
        :global(.jp-vocab-table .jp-vocab-kind-col),
        :global(.jp-vocab-table .jp-vocab-risk-col),
        :global(.jp-vocab-table .jp-vocab-stats-col),
        :global(.jp-vocab-table .jp-vocab-today-check-col),
        :global(.jp-vocab-table .jp-vocab-notes-col),
        :global(.jp-vocab-table .jp-vocab-mnemonic-col),
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
        :global(.jp-vocab-table .jp-vocab-reading-col),
        :global(.jp-vocab-table .jp-vocab-meaning-col),
        :global(.jp-vocab-table .jp-vocab-pos-col),
        :global(.jp-vocab-table .jp-vocab-risk-col),
        :global(.jp-vocab-table .jp-vocab-stats-col) {
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-risk-col) {
          white-space: nowrap;
          width: 4%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-risk-value) {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-col) {
          white-space: nowrap;
          width: 4.5%;
          min-width: 0;
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-total-never) {
          color: var(--muted);
          font-size: 0.8125rem;
          letter-spacing: 0.02em;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-value) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.35rem;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
        }
        :global(.jp-vocab-table .jp-vocab-today-check-value--active) {
          min-width: 1.5rem;
          padding: 0.12rem 0.4rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent) 22%, transparent);
          color: var(--accent);
          font-weight: 700;
          font-size: 0.9375rem;
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
        }
        :global(.jp-vocab-table .jp-vocab-admin-review-col) {
          white-space: nowrap;
          width: 4%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-admin-review-badge) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--fall) 18%, transparent);
          color: var(--fall);
          font-weight: 700;
          font-size: 0.8125rem;
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--fall) 35%, transparent);
        }
        :global(.jp-vocab-table .jp-vocab-admin-review-pending) {
          color: var(--muted);
          font-size: 0.875rem;
        }
        :global(.jp-vocab-table .jp-vocab-word-col) {
          font-size: 0.875rem;
          width: 9%;
          min-width: 0;
          padding-left: 0.4rem;
          padding-right: 0.4rem;
        }
        :global(.jp-vocab-table .jp-vocab-reading-col) {
          width: 7%;
          min-width: 0;
          padding-left: 0.4rem;
          padding-right: 0.4rem;
          word-break: break-word;
          line-height: 1.45;
        }
        .jp-vocab-reading-cell {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
        }
        .jp-vocab-reading-text {
          flex: 1 1 auto;
          min-width: 0;
        }
        .jp-vocab-reading-text--copy {
          border: none;
          background: transparent;
          padding: 0;
          font: inherit;
          color: inherit;
          cursor: pointer;
          text-align: inherit;
        }
        .jp-vocab-reading-text--copy:hover {
          color: var(--accent);
        }
        .jp-vocab-reading-text--pending {
          font-size: 0.8125rem;
          opacity: 0.72;
        }
        :global(.jp-vocab-table .jp-vocab-meaning-col) {
          width: 8%;
          min-width: 0;
          padding-left: 0.4rem;
          padding-right: 0.4rem;
          word-break: break-word;
          line-height: 1.45;
        }
        :global(.jp-vocab-table .jp-vocab-pos-col) {
          width: 5%;
          min-width: 3.25rem;
          vertical-align: middle;
        }
        :global(.jp-vocab-table .jp-vocab-mnemonic-col) {
          width: 5%;
          min-width: 0;
          max-width: none;
          white-space: nowrap;
        }
        :global(.jp-vocab-table thead .jp-vocab-mnemonic-col) {
          text-align: center;
          vertical-align: middle;
        }
        :global(.jp-vocab-table tbody .jp-vocab-mnemonic-col) {
          text-align: center;
          vertical-align: middle;
        }
        .jp-vocab-mnemonic-actions {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .jp-vocab-mnemonic-empty {
          color: color-mix(in srgb, var(--muted) 70%, transparent);
        }
        :global(.jp-vocab-table .jp-vocab-notes-col) {
          width: 6%;
          min-width: 0;
          white-space: nowrap;
        }
        :global(.jp-vocab-table thead .jp-vocab-notes-col) {
          text-align: center;
          vertical-align: middle;
        }
        :global(.jp-vocab-table tbody .jp-vocab-notes-col) {
          text-align: center;
          vertical-align: middle;
        }
        .jp-vocab-notes-actions {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          flex-wrap: wrap;
        }
        :global(.jp-vocab-table .jp-vocab-action-col) {
          position: sticky;
          right: 0;
          z-index: 2;
          width: 13%;
          min-width: 0;
          white-space: normal;
          /* 与「备注」等列一致：不单独铺底色，透出 compare-table 表头/斑马纹 */
          background: transparent;
          box-shadow: none;
        }
        :global(.jp-vocab-table thead .jp-vocab-action-col) {
          z-index: 3;
        }
        .jp-vocab-share-stack {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          max-width: 100%;
        }
        .jp-vocab-share-hint {
          font-size: 0.625rem;
          line-height: 1.35;
          color: var(--muted);
          text-align: center;
          font-weight: 400;
        }
        .jp-vocab-share-hint--desktop {
          display: block;
        }
        .jp-vocab-share-hint--mobile {
          display: none;
        }
        .jp-vocab-action-buttons {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }
        .jp-vocab-action-buttons :global(.btn-rsi-filter--compact) {
          min-width: 0;
          padding-inline: 0.35rem;
          font-size: 0.6875rem;
        }
        .jp-vocab-share-btn:not(:disabled):not(.jp-vocab-unshare-btn) {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
          font-weight: 600;
        }
        .jp-vocab-share-btn:not(:disabled):not(.jp-vocab-unshare-btn):hover {
          color: var(--accent);
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 16%, var(--panel));
        }
        :global(.jp-vocab-table .jp-vocab-kind-col) {
          white-space: nowrap;
          width: 3.5%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-seq-col) {
          white-space: nowrap;
          width: 3%;
          min-width: 0;
          color: var(--muted);
        }
        :global(.jp-vocab-table .jp-vocab-seq-cell) {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.12rem;
          min-height: 1.75rem;
        }
        :global(.jp-vocab-table .jp-vocab-seq-checked) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1rem;
          height: 1rem;
          border-radius: 999px;
          color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--fall) 35%, transparent);
        }
        :global(.jp-vocab-table .jp-vocab-seq-num) {
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }

        /* 16 寸屏 / 中等桌面：隐藏巧记，操作列固定可见 */
        @media (max-width: 1440px) {
          .jp-vocab-scroll-hint {
            display: block;
          }
          :global(.jp-vocab-table .jp-vocab-mnemonic-col) {
            display: none;
          }
          .jp-vocab-share-hint--desktop {
            display: none;
          }
          .jp-vocab-level-opt {
            font-size: 0.75rem;
            padding: 0.25rem 0.3rem;
            gap: 0.2rem;
            min-height: 1.75rem;
          }
          .jp-vocab-check-box {
            width: 0.85rem;
            height: 0.85rem;
          }
        }

        @media (max-width: 1280px) {
          .jp-vocab-section-head {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .jp-vocab-toolbar {
            justify-content: flex-start;
          }
        }

        /* 中等屏幕（旧断点保留给更窄窗口） */
        @media (max-width: 1100px) {
          .jp-vocab-scroll-hint {
            display: block;
          }
        }

        /* 手机 / 小屏：紧凑卡片布局 */
        @media (max-width: 768px) {
          .jp-vocab-section-head {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .jp-vocab-toolbar {
            flex-direction: column;
            align-items: stretch;
            width: 100%;
          }
          .jp-vocab-toolbar-summary {
            display: block;
            width: 100%;
            font-size: 0.9375rem;
            line-height: 1.45;
          }
          .jp-vocab-toolbar-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            min-height: 2.75rem;
            flex-shrink: 0;
          }
          .jp-vocab-toolbar-actions {
            display: none;
            flex-direction: column;
            align-items: stretch;
            width: 100%;
            gap: 0.5rem;
          }
          .jp-vocab-toolbar-actions--expanded {
            display: flex;
          }
          .jp-vocab-toolbar-actions :global(.btn-rsi-filter) {
            width: 100%;
            min-height: 2.75rem;
          }
          .jp-vocab-mobile-sort {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.5rem;
            margin-bottom: 0.75rem;
          }
          .jp-vocab-mobile-sort-btn {
            min-height: 2.75rem;
            width: 100%;
            font-size: clamp(0.8125rem, 3vw, 0.875rem);
          }
          .jp-vocab-mobile-sort-btn--active {
            border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
            background: color-mix(in srgb, var(--accent) 12%, var(--panel));
            color: var(--text);
          }
          .jp-vocab-mobile-sort-indicator {
            font-weight: 700;
          }
          .jp-vocab-scroll-hint {
            display: none;
          }
          :global(.jp-vocab-page) {
            padding-top: 0.75rem !important;
          }
          :global(.jp-vocab-table) {
            min-width: 0;
            table-layout: auto;
          }
          :global(.jp-vocab-table thead) {
            display: none;
          }
          :global(.jp-vocab-table tbody tr) {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.5rem 0.75rem;
            margin-bottom: 0.625rem;
            padding: 0.875rem 1rem;
            border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
            border-radius: 15px;
            background: color-mix(in srgb, var(--panel) 94%, var(--bg));
          }
          :global(.jp-vocab-table tbody td) {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            gap: 0.25rem;
            padding: 0;
            border: none;
            text-align: left;
            line-height: 1.35;
            min-width: 0;
            width: auto !important;
            max-width: none;
            position: static !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          :global(.jp-vocab-table tbody td::before) {
            content: attr(data-label) "：";
            flex: 0 0 auto;
            font-size: clamp(0.8125rem, 3.2vw, 0.9375rem);
            font-weight: 400;
            color: var(--muted);
            white-space: nowrap;
          }
          :global(.jp-vocab-table tbody td.jp-vocab-field-empty) {
            display: none;
          }
          :global(.jp-vocab-table tbody td > *) {
            flex: 1;
            min-width: 0;
            font-size: clamp(0.875rem, 3.4vw, 1rem);
          }
          :global(.jp-vocab-table .jp-vocab-seq-num) {
            font-size: clamp(0.875rem, 3.4vw, 1rem);
            font-weight: 600;
          }
          :global(.jp-vocab-table .jp-vocab-word-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
            padding: 0 0 0.5rem;
            margin-bottom: 0.125rem;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-word-col::before) {
            display: none;
          }
          .jp-vocab-word-cell {
            text-align: left;
            width: 100%;
            align-items: flex-start;
          }
          .jp-vocab-word-link,
          .jp-vocab-word-text {
            font-size: clamp(1.5rem, 6.5vw, 1.75rem);
            font-weight: 700;
            line-height: 1.2;
            text-align: left;
          }
          .jp-vocab-mobile-only {
            display: block;
          }
          .jp-vocab-notes-desktop {
            display: none;
          }
          .jp-vocab-mobile-reading-row {
            display: flex;
            align-items: center;
            gap: 0.375rem;
            width: 100%;
          }
          .jp-vocab-mobile-reading-row:empty {
            display: none;
            min-height: 0;
          }
          .jp-vocab-mobile-reading-row .jp-vocab-reading-text {
            font-size: clamp(0.875rem, 3.5vw, 1rem);
            color: var(--muted);
          }
          .jp-vocab-ref-hint {
            display: block;
            width: 100%;
            margin: 0;
            text-align: left;
            font-size: clamp(0.6875rem, 2.8vw, 0.75rem);
            color: color-mix(in srgb, var(--muted) 85%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-seq-col) {
            display: flex !important;
            grid-column: 1;
          }
          :global(.jp-vocab-table .jp-vocab-seq-col::before) {
            content: "编号：";
          }
          :global(.jp-vocab-table .jp-vocab-kind-col) {
            grid-column: 2;
          }
          :global(.jp-vocab-table .jp-vocab-kind-col::before) {
            content: "类型：";
          }
          :global(.jp-vocab-table .jp-vocab-reading-col) {
            display: none !important;
          }
          :global(.jp-vocab-table .jp-vocab-meaning-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: stretch;
            gap: 0;
          }
          :global(.jp-vocab-table .jp-vocab-meaning-col::before) {
            display: none;
          }
          .jp-vocab-meaning-desktop {
            display: none;
          }
          .jp-vocab-meaning-fold {
            display: block;
            width: 100%;
          }
          .jp-vocab-meaning-fold__summary {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0.125rem;
            list-style: none;
            cursor: pointer;
            padding: 0.375rem 0;
          }
          .jp-vocab-meaning-fold__summary::-webkit-details-marker {
            display: none;
          }
          .jp-vocab-fold-label {
            font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
            color: var(--muted);
            font-weight: 500;
          }
          .jp-vocab-meaning-preview {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            overflow: hidden;
            font-size: clamp(0.8125rem, 3vw, 0.9375rem);
            color: var(--muted);
            line-height: 1.4;
            width: 100%;
          }
          .jp-vocab-meaning-fold[open] .jp-vocab-meaning-preview {
            display: none;
          }
          .jp-vocab-meaning-full {
            margin: 0;
            font-size: clamp(0.8125rem, 3vw, 0.9375rem);
            color: var(--muted);
            line-height: 1.45;
          }
          :global(.jp-vocab-table .jp-vocab-pos-col) {
            grid-column: 1;
          }
          :global(.jp-vocab-table .jp-vocab-pos-col::before) {
            content: "词性：";
          }
          :global(.jp-vocab-table .jp-vocab-risk-col) {
            grid-column: 2;
          }
          :global(.jp-vocab-table .jp-vocab-risk-col::before) {
            content: "优先级：";
          }
          :global(.jp-vocab-table .jp-vocab-level-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: stretch;
            gap: 0.375rem;
            padding-top: 0.375rem;
            margin-top: 0.125rem;
            border-top: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-level-col::before) {
            flex: 0 0 auto;
            width: auto;
            max-width: none;
            font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
            font-weight: 500;
          }
          :global(.jp-vocab-table .jp-vocab-kind-badge) {
            flex: 0 0 auto;
            font-size: clamp(0.75rem, 3vw, 0.875rem) !important;
            padding: 0.1875rem 0.5rem !important;
            border-radius: 999px !important;
            border: 1px solid var(--border) !important;
            background: color-mix(in srgb, var(--panel) 88%, var(--bg)) !important;
            color: var(--text) !important;
            white-space: nowrap;
          }
          .jp-vocab-pos-badge {
            flex: 1 1 auto;
            min-width: 0;
            max-width: 5em;
            font-size: clamp(0.75rem, 3vw, 0.875rem) !important;
            padding: 0.2rem 0.35rem !important;
            border-radius: 8px !important;
            border: 1px solid var(--border) !important;
            background: color-mix(in srgb, var(--panel) 88%, var(--bg)) !important;
            color: var(--text) !important;
            white-space: normal !important;
            word-break: break-all;
            overflow-wrap: anywhere;
            line-height: 1.35 !important;
            text-align: center;
          }
          :global(.jp-vocab-table .jp-vocab-kind-badge--grammar) {
            color: var(--accent) !important;
            border-color: color-mix(in srgb, var(--accent) 35%, var(--border)) !important;
            background: color-mix(in srgb, var(--accent) 10%, var(--panel)) !important;
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge) {
            display: inline-flex !important;
            align-items: center;
            flex: 0 0 auto !important;
            padding: 0.125rem 0.4375rem;
            border-radius: 999px;
            font-size: clamp(0.75rem, 3vw, 0.875rem) !important;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            border: 1px solid var(--border);
            background: color-mix(in srgb, var(--panel) 88%, var(--bg));
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge--low) {
            color: var(--fall);
            border-color: color-mix(in srgb, var(--fall) 30%, var(--border));
            background: color-mix(in srgb, var(--fall) 12%, var(--panel));
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge--mid) {
            color: var(--accent);
            border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
            background: color-mix(in srgb, var(--accent) 12%, var(--panel));
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge--high) {
            color: var(--rise);
            border-color: color-mix(in srgb, var(--rise) 30%, var(--border));
            background: color-mix(in srgb, var(--rise) 12%, var(--panel));
          }
          .jp-vocab-level-wrap {
            width: 100%;
            align-items: stretch;
          }
          .jp-vocab-level-history {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.25rem 0.375rem;
            width: 100%;
            font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
            font-weight: 500;
            line-height: 1.35;
            color: var(--muted);
          }
          .jp-vocab-level-history__item--very {
            color: var(--fall);
          }
          .jp-vocab-level-history__item--weak {
            color: var(--rise);
          }
          .jp-vocab-level-history__sep {
            color: color-mix(in srgb, var(--muted) 70%, transparent);
          }
          .jp-vocab-level-sync-hint {
            max-width: none;
            padding: 0.2rem 0.35rem 0.05rem;
            text-align: center;
          }
          .jp-vocab-levels {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0;
            width: 100%;
            border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
            border-radius: 10px;
            overflow: hidden;
            background: color-mix(in srgb, var(--bg) 60%, var(--panel));
          }
          .jp-vocab-level-opt {
            min-height: 2.75rem;
            padding: 0.375rem 0.25rem;
            flex: 1 1 0;
            justify-content: center;
            font-size: clamp(0.6875rem, 2.8vw, 0.8125rem);
            border: none;
            border-radius: 0;
            border-right: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
            background: transparent;
            white-space: nowrap;
          }
          .jp-vocab-level-opt:last-child {
            border-right: none;
          }
          .jp-vocab-check-box {
            display: none;
          }
          .jp-vocab-level-opt.is-checked {
            background: color-mix(in srgb, var(--accent) 18%, var(--panel));
            color: var(--accent);
            font-weight: 600;
          }
          .jp-vocab-level-opt--very.is-checked {
            background: color-mix(in srgb, var(--fall) 16%, var(--panel));
            color: var(--fall);
          }
          .jp-vocab-level-opt--weak.is-checked {
            background: color-mix(in srgb, var(--rise) 16%, var(--panel));
            color: var(--rise);
          }
          :global(.jp-vocab-table .jp-vocab-stats-col),
          :global(.jp-vocab-table .jp-vocab-today-check-col) {
            display: none;
          }
          :global(.jp-vocab-table .jp-vocab-notes-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: stretch;
            padding-top: 0.25rem;
            border-top: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-notes-col::before) {
            display: none;
          }
          .jp-vocab-notes-fold {
            width: 100%;
          }
          .jp-vocab-notes-fold > summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            min-height: 2.75rem;
            list-style: none;
            cursor: pointer;
            padding: 0.125rem 0;
          }
          .jp-vocab-notes-fold > summary::-webkit-details-marker {
            display: none;
          }
          .jp-vocab-notes-fold__hint {
            font-size: clamp(0.75rem, 2.8vw, 0.8125rem);
            color: var(--accent);
          }
          .jp-vocab-notes-fold:not([open]) .jp-vocab-notes-actions {
            display: none;
          }
          .jp-vocab-notes-actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding-bottom: 0.25rem;
          }
          :global(.jp-vocab-table .jp-vocab-action-col) {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: stretch;
            padding-top: 0.25rem;
          }
          :global(.jp-vocab-table .jp-vocab-action-col::before) {
            display: none;
          }
          .jp-vocab-action-buttons {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            width: 100%;
          }
          .jp-vocab-action-row {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem;
            width: 100%;
          }
          .jp-vocab-action-row > :global(.btn-rsi-filter),
          .jp-vocab-action-row > .jp-vocab-share-stack,
          .jp-vocab-action-row > :global(.jp-vocab-save-progress) {
            width: 100%;
            min-width: 0;
          }
          .jp-vocab-action-row > :only-child {
            grid-column: 1 / -1;
          }
          .jp-vocab-action-row > .jp-vocab-share-stack,
          .jp-vocab-action-row > :global(.jp-vocab-unshare-btn) {
            display: none !important;
          }
          .jp-vocab-share-stack {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            max-width: none;
            width: 100%;
            gap: 0.25rem;
          }
          .jp-vocab-share-stack :global(.jp-vocab-share-btn) {
            width: 100%;
          }
          .jp-vocab-action-row :global(.jp-vocab-save-progress) {
            max-width: none;
            min-width: 0;
          }
          .jp-vocab-share-hint--desktop {
            display: none;
          }
          .jp-vocab-share-hint--mobile {
            display: block;
            font-size: clamp(0.6875rem, 2.8vw, 0.75rem);
            padding: 0 0.125rem 0.125rem;
          }
          :global(.jp-vocab-mobile-action-btn) {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            gap: 0.375rem;
            min-height: 2.75rem;
            width: 100%;
            font-size: clamp(0.8125rem, 3vw, 0.875rem);
            border-radius: 10px;
          }
          :global(.jp-vocab-mobile-action-btn--full) {
            grid-column: 1 / -1;
          }
          .jp-vocab-action-buttons .jp-vocab-mobile-action-btn svg,
          .jp-vocab-notes-actions .jp-vocab-mobile-action-btn svg {
            display: block;
            flex-shrink: 0;
          }
          :global(.jp-vocab-table .jp-vocab-notes-col.jp-vocab-field-empty) {
            display: none;
          }
        }

        @media (max-width: 480px) {
          :global(.jp-vocab-table tbody tr) {
            padding: 0.75rem 0.875rem;
            gap: 0.4375rem 0.625rem;
          }
        }
    `}</style>
  );
}
