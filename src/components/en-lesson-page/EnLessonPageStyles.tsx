"use client";

/** Extracted from EnLessonPage.tsx. */
export function EnLessonPageStyles() {
  return (
    <style jsx global>{`
        :global(.page-wrap:has(.jp-lesson-page)) {
          max-width: min(1320px, 92vw);
        }
        :global(.jp-lesson-page) {
          min-width: 0;
          max-width: 100%;
        }
        .jp-lesson-cards {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-width: 0;
          max-width: 100%;
        }
        .jp-lesson-admin-links {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1.25rem;
          margin-bottom: 0.75rem;
          font-size: 0.875rem;
        }
        .jp-lesson-status-card {
          margin: 0;
          min-width: 0;
          max-width: 100%;
        }
        .jp-lesson-status-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .jp-lesson-status-card-title {
          font-size: 1.375rem;
          font-weight: 600;
          margin: 0;
          letter-spacing: 0.02em;
        }
        .jp-lesson-status-card-count {
          font-size: 0.8125rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .jp-lesson-status-card-empty {
          margin: 0;
          color: var(--muted);
          font-size: 0.875rem;
        }
        .jp-lesson-status-card--learning {
          border-left: 3px solid color-mix(in srgb, var(--accent) 70%, var(--border));
        }
        .jp-lesson-status-card--learning .jp-lesson-status-card-title {
          color: var(--accent);
        }
        .jp-lesson-status-card--pending {
          border-left: 3px solid var(--border);
        }
        .jp-lesson-status-card--completed {
          border-left: 3px solid color-mix(in srgb, var(--fall) 70%, var(--border));
        }
        .jp-lesson-status-card--completed .jp-lesson-status-card-title {
          color: var(--fall);
        }
        :global(.jp-lesson-table-wrap) {
          /* 禁止横向滚动：列宽压缩 + 折行塞进视口（勿用操作列 sticky） */
          overflow-x: hidden;
          max-width: 100%;
          min-width: 0;
        }
        :global(.jp-lesson-table) {
          width: 100%;
          table-layout: fixed;
          overflow: visible;
          border-collapse: collapse;
        }
        /* 桌面与手机同一套状态 Tab：只显示当前一类（搜索时例外，见 filter-search） */
        .jp-lesson-cards :global(.jp-lesson-mobile-status-filter) {
          display: flex;
          gap: 0.5rem;
          margin: 0 0 0.75rem;
        }
        .jp-lesson-cards :global(.jp-lesson-mobile-status-tab) {
          flex: 1 1 0;
          display: inline-flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          min-height: 2.5rem;
          padding: 0.45rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--panel);
          color: var(--muted);
          font: inherit;
          font-size: 0.9375rem;
          font-weight: 600;
          line-height: 1.2;
          cursor: pointer;
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            color 0.15s ease;
        }
        .jp-lesson-cards :global(.jp-lesson-mobile-status-tab-count) {
          font-size: 0.8125rem;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
          opacity: 0.85;
        }
        .jp-lesson-cards :global(.jp-lesson-mobile-status-tab--learning.is-active) {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        .jp-lesson-cards :global(.jp-lesson-mobile-status-tab--pending.is-active) {
          color: var(--text);
          border-color: color-mix(in srgb, var(--text) 25%, var(--border));
          background: color-mix(in srgb, var(--text) 6%, var(--panel));
        }
        .jp-lesson-cards :global(.jp-lesson-mobile-status-tab--completed.is-active) {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 50%, var(--border));
          background: color-mix(in srgb, var(--fall) 10%, var(--panel));
        }
        .jp-lesson-cards.jp-lesson-mobile-filter-learning :global(.jp-lesson-status-card--pending),
        .jp-lesson-cards.jp-lesson-mobile-filter-learning :global(.jp-lesson-status-card--completed),
        .jp-lesson-cards.jp-lesson-mobile-filter-pending :global(.jp-lesson-status-card--learning),
        .jp-lesson-cards.jp-lesson-mobile-filter-pending :global(.jp-lesson-status-card--completed),
        .jp-lesson-cards.jp-lesson-mobile-filter-completed :global(.jp-lesson-status-card--learning),
        .jp-lesson-cards.jp-lesson-mobile-filter-completed :global(.jp-lesson-status-card--pending) {
          display: none !important;
        }
        .jp-lesson-cards.jp-lesson-mobile-filter-search :global(.jp-lesson-status-card--learning),
        .jp-lesson-cards.jp-lesson-mobile-filter-search :global(.jp-lesson-status-card--pending),
        .jp-lesson-cards.jp-lesson-mobile-filter-search :global(.jp-lesson-status-card--completed) {
          display: block !important;
        }
        /* Tab 已标状态，隐藏区块大标题，避免与选项卡重复；搜索跨组时再显示 */
        .jp-lesson-cards :global(.jp-lesson-status-card-head) {
          display: none;
        }
        .jp-lesson-cards.jp-lesson-mobile-filter-search :global(.jp-lesson-status-card-head) {
          display: flex;
        }
        @media (min-width: 768px) {
          /* Excel 式冻结表头：区内滚动时列名（老师/时间等）始终可见 */
          :global(.jp-lesson-table-wrap) {
            overflow-y: auto;
            max-height: min(70vh, calc(100dvh - 10rem));
            -webkit-overflow-scrolling: touch;
          }
          :global(.jp-lesson-table thead th) {
            position: sticky;
            top: 0;
            z-index: 3;
            background: #243044;
            box-shadow: 0 1px 0 color-mix(in srgb, var(--border) 80%, transparent);
          }
        }
        :global(.jp-lesson-mobile-card-head),
        :global(.jp-lesson-mobile-card-footer) {
          display: none !important;
        }
        :global(.jp-lesson-mobile-field-value) {
          display: contents;
        }
        :global(.jp-lesson-mobile-icon),
        :global(.jp-lesson-mobile-btn-icon),
        :global(.jp-lesson-mobile-content-item) {
          display: none;
        }
        :global(.jp-lesson-content-desktop) {
          display: flex;
        }
        :global(.jp-lesson-table th),
        :global(.jp-lesson-table td) {
          vertical-align: middle;
          padding: 0.45rem 0.4rem;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        :global(.jp-lesson-id-col) {
          width: 2.5rem;
          min-width: 2.5rem;
          max-width: 2.75rem;
          padding-left: 0.2rem !important;
          padding-right: 0.2rem !important;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          font-size: 0.75rem;
          text-align: center;
        }
        :global(.jp-lesson-kind-col) {
          width: 1.55rem;
          min-width: 1.55rem;
          max-width: 1.7rem;
          padding-left: 0.05rem !important;
          padding-right: 0.05rem !important;
          text-align: center;
        }
        :global(.jp-lesson-content-col) {
          min-width: 0;
          width: 16%;
          word-break: break-word;
        }
        :global(.jp-lesson-content-count-col) {
          width: 2rem;
          min-width: 2rem;
          max-width: 2.25rem;
          padding-left: 0.15rem !important;
          padding-right: 0.15rem !important;
          text-align: center;
          font-variant-numeric: tabular-nums;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        :global(.jp-lesson-content-preview) {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
          min-width: 0;
          max-width: 100%;
        }
        :global(.jp-lesson-content-lines) {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          line-height: 1.45;
          min-width: 0;
          max-width: 100%;
        }
        :global(.jp-lesson-content-preview.is-clamped .jp-lesson-content-lines) {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        :global(.jp-lesson-content-line) {
          display: block;
          word-break: break-word;
        }
        :global(.jp-lesson-content-more-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 1.5rem;
          padding: 0.1rem 0.45rem;
          border: 1px solid var(--border);
          border-radius: 5px;
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
          color: var(--accent);
          font: inherit;
          font-size: 0.75rem;
          line-height: 1.3;
          cursor: pointer;
        }
        :global(.jp-lesson-content-more-btn:hover) {
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
        }
        :global(.jp-lesson-merged-stack) {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        :global(.jp-lesson-merged-stack-item + .jp-lesson-merged-stack-item) {
          margin-top: 0.65rem;
          padding-top: 0.65rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
        }
        :global(.jp-lesson-row--merged) {
          background: color-mix(in srgb, var(--accent) 4%, transparent);
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-0) {
          background: color-mix(in srgb, #c9b86a 10%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-1) {
          background: color-mix(in srgb, var(--fall) 9%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-2) {
          background: color-mix(in srgb, #6ab8c8 9%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-3) {
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-4) {
          background: color-mix(in srgb, #9a8fbf 9%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-5) {
          background: color-mix(in srgb, #c8a882 9%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-0:hover) {
          background: color-mix(in srgb, #c9b86a 13%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-1:hover) {
          background: color-mix(in srgb, var(--fall) 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-2:hover) {
          background: color-mix(in srgb, #6ab8c8 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-3:hover) {
          background: color-mix(in srgb, var(--accent) 11%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-4:hover) {
          background: color-mix(in srgb, #9a8fbf 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--day-tone-5:hover) {
          background: color-mix(in srgb, #c8a882 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-0) {
          background: color-mix(in srgb, #c9b86a 12%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-1) {
          background: color-mix(in srgb, var(--fall) 11%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-2) {
          background: color-mix(in srgb, #6ab8c8 11%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-3) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-4) {
          background: color-mix(in srgb, #9a8fbf 11%, var(--panel));
        }
        :global(.jp-lesson-status-card--learning .jp-lesson-table tbody tr.jp-lesson-row--merged.jp-lesson-row--day-tone-5) {
          background: color-mix(in srgb, #c8a882 11%, var(--panel));
        }
        :global(.jp-lesson-merged-edit-stack) {
          display: inline-flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        :global(.jp-lesson-dt-compact) {
          display: none;
        }
        :global(.jp-lesson-next-class-dt-compact),
        :global(.jp-lesson-class-duration-dt-compact) {
          display: none;
        }
        :global(.jp-lesson-uploaded-col),
        :global(.jp-lesson-status-at-col) {
          white-space: normal;
          width: 5.5rem;
          min-width: 5.5rem;
          max-width: 6rem;
          font-variant-numeric: tabular-nums;
          font-size: 0.8125rem;
        }
        :global(.jp-lesson-dt-stacked) {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.1rem;
          line-height: 1.25;
        }
        :global(.jp-lesson-dt-date) {
          display: block;
        }
        :global(.jp-lesson-dt-time) {
          display: block;
          color: var(--muted);
          font-size: 0.75rem;
        }
        :global(.jp-lesson-operator-col) {
          white-space: nowrap;
          font-size: 0.8125rem;
          color: var(--muted);
          width: 3.5rem;
          min-width: 3.25rem;
        }
        :global(.jp-lesson-teacher-col) {
          font-size: 0.8125rem;
          min-width: 0;
          width: 7%;
        }
        :global(.jp-lesson-teacher-cell) {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        :global(.jp-lesson-next-class-col) {
          font-size: 0.8125rem;
          min-width: 0;
          width: 8%;
        }
        :global(.jp-lesson-next-class-col--sortable) {
          padding: 0;
        }
        :global(.jp-lesson-sort-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          width: 100%;
          min-height: 2.5rem;
          padding: 0.6rem 0.75rem;
          border: none;
          background: transparent;
          color: inherit;
          font: inherit;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: color 0.15s ease, background 0.15s ease;
        }
        :global(.jp-lesson-sort-btn:hover) {
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 8%, transparent);
        }
        :global(.jp-lesson-sort-btn:focus-visible) {
          outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
          outline-offset: -2px;
        }
        :global(.jp-lesson-next-class-col--sorted-asc .jp-lesson-sort-btn),
        :global(.jp-lesson-next-class-col--sorted-desc .jp-lesson-sort-btn) {
          color: var(--accent);
        }
        :global(.jp-lesson-sort-indicator) {
          font-size: 0.75rem;
          line-height: 1;
          opacity: 0.9;
        }
        :global(.jp-lesson-next-class-cell) {
          display: inline-flex;
          align-items: flex-start;
          gap: 0.35rem;
        }
        :global(.jp-lesson-next-class-lines) {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          line-height: 1.35;
        }
        :global(.jp-lesson-next-class-entry) {
          display: flex;
          flex-direction: column;
          gap: 0.08rem;
        }
        :global(.jp-lesson-next-class-label) {
          color: var(--accent);
          white-space: normal;
          word-break: break-word;
        }
        :global(.jp-lesson-class-duration-label) {
          color: var(--muted);
          font-size: 0.75rem;
          white-space: normal;
        }
        :global(.jp-lesson-next-class-label.is-undefined) {
          color: var(--muted);
        }
        :global(.jp-lesson-next-class-label.is-done) {
          color: var(--fall);
        }
        :global(.jp-lesson-actions-col) {
          text-align: center;
          width: 8.75rem;
          min-width: 8.5rem;
          max-width: 9.25rem;
          white-space: normal;
          vertical-align: middle;
        }
        :global(.jp-lesson-notes-col) {
          text-align: center;
        }
        :global(.jp-lesson-notes-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          min-height: 2rem;
          padding: 0.25rem 0.55rem;
          font-size: 0.8125rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--accent);
          cursor: pointer;
          font: inherit;
          line-height: 1.3;
          text-decoration: none;
        }
        :global(.jp-lesson-notes-btn:hover) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
          text-decoration: none;
        }
        :global(.jp-lesson-notes-count) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.15rem;
          height: 1.15rem;
          padding: 0 0.25rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
          color: var(--accent);
          font-size: 0.6875rem;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-lesson-kind) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
          width: 1.2rem;
          font-size: 0.6875rem;
          padding: 0.08rem 0;
          border-radius: 3px;
          border: 1px solid var(--border);
          color: var(--muted);
          line-height: 1.15;
        }
        :global(.jp-lesson-kind--grammar) {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, transparent);
        }
        :global(.jp-lesson-complete-col) {
          text-align: center;
        }
        :global(.jp-lesson-complete-wrap) {
          position: relative;
          display: inline-flex;
          align-items: center;
          margin: 0 auto;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--muted);
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }
        :global(.jp-lesson-complete-wrap.is-done) {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 50%, var(--border));
          background: color-mix(in srgb, var(--fall) 12%, var(--panel));
        }
        :global(.jp-lesson-complete-wrap.is-learning) {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
        }
        :global(.jp-lesson-complete-wrap:not(.is-readonly):not(.is-saving):hover) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
        }
        :global(.jp-lesson-complete-wrap.is-done:not(.is-readonly):not(.is-saving):hover) {
          border-color: color-mix(in srgb, var(--fall) 65%, var(--border));
          background: color-mix(in srgb, var(--fall) 16%, var(--panel));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--fall) 22%, transparent);
        }
        :global(.jp-lesson-complete-wrap::after) {
          content: "";
          position: absolute;
          right: 0.55rem;
          top: 50%;
          width: 0.45rem;
          height: 0.45rem;
          border-right: 1.5px solid currentColor;
          border-bottom: 1.5px solid currentColor;
          transform: translateY(-65%) rotate(45deg);
          pointer-events: none;
          opacity: 0.72;
        }
        :global(.jp-lesson-complete-wrap.is-readonly) {
          opacity: 0.72;
        }
        :global(.jp-lesson-complete-wrap.is-saving) {
          opacity: 0.55;
        }
        :global(.jp-lesson-complete-select) {
          display: block;
          min-height: 2rem;
          width: 6.5rem;
          min-width: 6.5rem;
          max-width: 100%;
          padding: 0.25rem 1.35rem 0.25rem 0.45rem;
          font-size: 0.8125rem;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: inherit;
          cursor: pointer;
          font: inherit;
          text-align: center;
          text-align-last: center;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
        }
        :global(.jp-lesson-complete-select:focus-visible) {
          outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
          outline-offset: 1px;
        }
        :global(.jp-lesson-complete-select:disabled) {
          cursor: not-allowed;
        }
        :global(.jp-lesson-complete-wrap.is-readonly .jp-lesson-complete-select:disabled),
        :global(.jp-lesson-complete-wrap.is-saving .jp-lesson-complete-select:disabled) {
          cursor: not-allowed;
        }
        :global(.jp-lesson-actions) {
          display: grid;
          grid-template-columns: repeat(2, max-content);
          justify-content: center;
          align-items: center;
          gap: 0.3rem;
          margin-inline: auto;
        }
        :global(.jp-lesson-action-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 2rem;
          padding: 0.25rem 0.55rem;
          font-size: 0.8125rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--accent);
          text-decoration: none;
          cursor: pointer;
          font: inherit;
          line-height: 1.3;
        }
        :global(.jp-lesson-action-btn:hover) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        :global(.jp-lesson-action-btn--danger) {
          color: var(--rise);
        }
        :global(.jp-lesson-action-btn--danger:hover) {
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
        }
        :global(.jp-lesson-action-btn--danger:disabled) {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
  );
}
