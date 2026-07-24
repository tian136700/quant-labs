"use client";

export function JpVocabPageStylesTable() {
  return (
    <style jsx global>{`
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
          :global(.jp-vocab-table .jp-vocab-risk-badge--never) {
            color: var(--muted);
            border-color: var(--border);
            background: color-mix(in srgb, var(--panel) 92%, var(--muted) 8%);
            font-weight: 500;
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
