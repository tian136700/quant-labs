"use client";

export function JpVocabTeacherQuizFlashcardStyles() {
  return (
    <style jsx global>{`
        .jp-vocab-teacher-quiz-overlay {
          position: fixed;
          inset: 0;
          z-index: 1002;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(0.5rem, 3vw, 1rem);
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          background: rgba(8, 12, 18, 0.78);
          backdrop-filter: blur(8px);
          scrollbar-width: none;
        }
        .jp-vocab-teacher-quiz-overlay::-webkit-scrollbar {
          display: none;
        }
        .jp-vocab-teacher-quiz-card {
          width: min(32rem, 96vw);
          flex-shrink: 0;
          overflow: visible;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.85rem 1rem 0.9rem;
          margin: auto;
          background: linear-gradient(
            165deg,
            color-mix(in srgb, var(--panel) 92%, #fff 8%) 0%,
            var(--panel) 55%,
            color-mix(in srgb, var(--panel) 94%, var(--accent) 6%) 100%
          );
          border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
          border-radius: 16px;
          box-shadow:
            0 20px 50px rgba(0, 0, 0, 0.38),
            0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent) inset;
        }
        .jp-vocab-teacher-quiz__scroll-body {
          display: contents;
        }
        /* 网页端（宽屏）：加宽加高，中间区域滚动，尽量完整显示例句/备注 */
        @media (min-width: 1025px) {
          .jp-vocab-teacher-quiz-card {
            width: min(44rem, 92vw);
            max-height: min(90vh, 58rem);
            overflow: hidden;
            gap: 0.55rem;
            padding: 1.05rem 1.25rem 1.05rem;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__header,
          .jp-vocab-teacher-quiz-card .jp-vocab-admin-review__today-banner,
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__level,
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__stats,
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__nav {
            flex-shrink: 0;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__scroll-body {
            display: flex;
            flex: 1 1 auto;
            min-height: 0;
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
            flex-direction: column;
            gap: 0.55rem;
            padding-right: 0.4rem;
            margin-right: -0.1rem;
            scrollbar-width: auto;
            scrollbar-color: color-mix(in srgb, var(--accent) 55%, var(--muted))
              color-mix(in srgb, var(--border) 70%, transparent);
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__scroll-body::-webkit-scrollbar {
            width: 10px;
            display: block;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__scroll-body::-webkit-scrollbar-track {
            background: color-mix(in srgb, var(--border) 55%, transparent);
            border-radius: 8px;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__scroll-body::-webkit-scrollbar-thumb {
            background: color-mix(in srgb, var(--accent) 50%, var(--muted));
            border-radius: 8px;
            border: 2px solid color-mix(in srgb, var(--panel) 80%, transparent);
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__examples,
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__notes {
            max-height: none;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__notes-body {
            overflow: visible;
            max-height: none;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__examples-text {
            font-size: clamp(1.1rem, 1.5vw, 1.3rem);
            line-height: 1.6;
          }
        }
        .jp-vocab-teacher-quiz-card--coach {
          /* 带读与抽问网页端共用加宽布局；手机端见下方 max-width */
        }
        .jp-vocab-teacher-quiz__header {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .jp-vocab-teacher-quiz__header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .jp-vocab-teacher-quiz__header-left {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.5rem;
        }
        .jp-vocab-teacher-quiz__kind {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__kind--grammar {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__kind--coach {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__mode {
          display: inline-block;
          font-size: 0.6875rem;
          line-height: 1.2;
          padding: 0.12rem 0.4rem;
          border-radius: 4px;
          border: 1px solid var(--border);
          color: var(--muted);
          font-weight: 500;
          letter-spacing: 0.02em;
        }
        .jp-vocab-teacher-quiz__seq,
        .jp-vocab-teacher-quiz__progress,
        .jp-vocab-teacher-quiz__remaining {
          font-size: 0.75rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-teacher-quiz__progress {
          font-weight: 600;
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__remaining {
          color: color-mix(in srgb, var(--muted) 88%, var(--rise) 12%);
        }
        .jp-vocab-teacher-quiz__header-progress {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          padding: 0.45rem 0.55rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 45%, var(--panel));
        }
        .jp-vocab-teacher-quiz__header-progress--daily {
          border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
          background: color-mix(in srgb, var(--panel) 90%, var(--accent) 10%);
        }
        .jp-vocab-teacher-quiz__header-progress--complete {
          border-color: color-mix(in srgb, var(--fall) 35%, var(--border));
          background: color-mix(in srgb, var(--panel) 88%, var(--fall) 12%);
        }
        .jp-vocab-teacher-quiz__header-progress-head {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.25rem 0.5rem;
        }
        .jp-vocab-teacher-quiz__header-progress-title {
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__header-progress-stats {
          font-size: 0.6875rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-teacher-quiz__header-progress-stats strong {
          color: var(--accent);
          font-weight: 700;
        }
        .jp-vocab-teacher-quiz__header-progress--complete
          .jp-vocab-teacher-quiz__header-progress-stats
          strong {
          color: var(--fall);
        }
        .jp-vocab-teacher-quiz__header-progress-sep {
          margin: 0 0.1rem;
        }
        .jp-vocab-teacher-quiz__header-progress-remaining,
        .jp-vocab-teacher-quiz__header-progress-done {
          margin-left: 0.15rem;
          font-size: 0.625rem;
        }
        .jp-vocab-teacher-quiz__header-progress-done {
          color: var(--fall);
          font-weight: 600;
        }
        .jp-vocab-teacher-quiz__progress-track {
          height: 0.4rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--border) 70%, transparent);
          overflow: hidden;
        }
        .jp-vocab-teacher-quiz__progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent) 85%, #fff),
            var(--accent)
          );
          transition: width 0.35s ease;
        }
        .jp-vocab-teacher-quiz__header-progress--complete
          .jp-vocab-teacher-quiz__progress-fill {
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--fall) 80%, #fff),
            var(--fall)
          );
        }
        .jp-vocab-teacher-quiz__close-x {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }
        .jp-vocab-teacher-quiz__close-x:hover {
          color: var(--text);
          border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        }
        .jp-vocab-teacher-quiz__student-peek-hint {
          margin: 0;
          padding: 0.55rem 0.75rem;
          border-radius: 8px;
          border: 1.5px solid #f0a840;
          background: color-mix(in srgb, #f0a840 28%, var(--panel));
          color: #ffd080;
          font-size: 0.9rem;
          font-weight: 700;
          text-align: center;
          line-height: 1.45;
          letter-spacing: 0.02em;
          box-shadow:
            0 0 0 1px color-mix(in srgb, #f0a840 35%, transparent) inset,
            0 2px 10px color-mix(in srgb, #f0a840 25%, transparent);
        }
        .jp-vocab-teacher-quiz__hero {
          text-align: center;
          padding: 0.15rem 0 0;
        }
        .jp-vocab-teacher-quiz__reading-row {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: center;
          gap: 0.35rem 0.55rem;
        }
        .jp-vocab-teacher-quiz__kind-prefix {
          flex-shrink: 0;
          font-size: clamp(1.2rem, 4.5vw, 1.55rem);
          font-weight: 700;
          letter-spacing: 0.02em;
          line-height: 1.25;
          color: var(--text);
        }
        .jp-vocab-teacher-quiz__kind-prefix--grammar {
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__reading {
          font-size: clamp(1.85rem, 7vw, 2.35rem);
          font-weight: 700;
          letter-spacing: 0.04em;
          line-height: 1.2;
        }
        .jp-vocab-teacher-quiz__kanji {
          font-size: clamp(1.35rem, 5vw, 1.75rem);
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__word-main {
          font-size: clamp(1.85rem, 7vw, 2.35rem);
          font-weight: 700;
          line-height: 1.25;
        }
        .jp-vocab-teacher-quiz__word-link {
          border: none;
          background: transparent;
          padding: 0;
          font: inherit;
          color: var(--accent);
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 0.15em;
        }
        .jp-vocab-teacher-quiz__word-link.jp-vocab-teacher-quiz__reading {
          font-size: clamp(1.85rem, 7vw, 2.35rem);
          font-weight: 700;
          letter-spacing: 0.04em;
          line-height: 1.2;
        }
        .jp-vocab-teacher-quiz__word-link.jp-vocab-teacher-quiz__kanji {
          font-size: clamp(1.35rem, 5vw, 1.75rem);
          font-weight: 600;
        }
        .jp-vocab-teacher-quiz__word-link:hover {
          color: color-mix(in srgb, var(--accent) 80%, #fff);
        }
        .jp-vocab-teacher-quiz__ref-hint {
          display: block;
          margin-top: 0.25rem;
          border: none;
          background: transparent;
          padding: 0;
          font: inherit;
          font-size: 0.75rem;
          color: var(--accent);
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 0.12em;
        }
        .jp-vocab-teacher-quiz__ref-hint:hover {
          color: color-mix(in srgb, var(--accent) 80%, #fff);
        }
        .jp-vocab-teacher-quiz__info {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding: 0.5rem 0.65rem;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
        }
        .jp-vocab-teacher-quiz__meta {
          margin: 0;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.25rem 0.65rem;
          font-size: 0.875rem;
          line-height: 1.4;
        }
        .jp-vocab-teacher-quiz__meta dt {
          margin: 0;
          color: var(--muted);
          white-space: nowrap;
          font-weight: 500;
        }
        .jp-vocab-teacher-quiz__meta dd {
          margin: 0;
          color: var(--text);
        }
        .jp-vocab-teacher-quiz__meta-empty {
          color: var(--muted);
          font-style: italic;
        }
        .jp-vocab-teacher-quiz__meaning-source {
          /* 角标样式由 .jp-vocab-source-label 统一 */
        }
        .jp-vocab-teacher-quiz__meaning-wrap {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.15rem;
          min-width: 0;
          box-sizing: border-box;
        }
        .jp-vocab-teacher-quiz__meaning-wrap :global(.jp-vocab-source-label) {
          font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          font-size: 0.625rem;
          font-weight: 500;
          line-height: 1.25;
          letter-spacing: 0.01em;
          color: color-mix(in srgb, var(--muted) 78%, transparent);
        }
        .jp-vocab-teacher-quiz__pos {
          display: inline-block;
          padding: 0.1rem 0.45rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__actions-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.35rem 0.45rem;
          padding-top: 0.15rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
        }
        .jp-vocab-teacher-quiz__actions-left {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.45rem;
          min-width: 0;
        }
        .jp-vocab-teacher-quiz__actions-right {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          margin-left: auto;
          flex: 0 0 auto;
        }
        .jp-vocab-teacher-quiz__action-btn {
          min-height: 1.85rem;
        }
        .jp-vocab-teacher-quiz__share-btn:not(.jp-vocab-teacher-quiz__share-btn--unshare) {
          font-weight: 600;
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        .jp-vocab-teacher-quiz__share-btn--locked:disabled {
          filter: grayscale(0.35);
        }
        .jp-vocab-teacher-quiz__level-main {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.4rem 0.5rem;
          width: 100%;
        }
        .jp-vocab-teacher-quiz__level-progress {
          margin-top: 0.35rem;
        }
        .jp-vocab-teacher-quiz__level {
          padding: 0.5rem 0.6rem;
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent) 6%, var(--bg));
          border: 1px solid color-mix(in srgb, var(--accent) 15%, var(--border));
        }
        .jp-vocab-teacher-quiz__level-label {
          margin: 0 0 0.4rem;
          font-size: 0.8125rem;
          font-weight: 600;
          line-height: 1.35;
          text-align: center;
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz__level-wrap {
          width: 100%;
          align-items: stretch;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-wrap {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          max-width: 100%;
          width: 100%;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-levels {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem 0.5rem;
          min-width: 0;
          width: 100%;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          min-height: 2rem;
          padding: 0.35rem 0.5rem;
          font-size: 0.8125rem;
          font-weight: 400;
          cursor: pointer;
          white-space: nowrap;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: var(--text);
          font: inherit;
          line-height: 1.3;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-check-box {
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
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt.is-checked .jp-vocab-check-box {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 18%, var(--bg));
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--very.is-checked {
          color: var(--fall);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--very.is-checked .jp-vocab-check-box {
          border-color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, var(--bg));
          color: var(--fall);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--weak.is-checked {
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--weak.is-checked .jp-vocab-check-box {
          border-color: var(--rise);
          background: color-mix(in srgb, var(--rise) 18%, var(--bg));
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt.is-checked {
          background: rgba(61, 139, 253, 0.08);
          font-weight: 400;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.04);
        }
        /* 带读/预览/学生：熟悉程度只读但仍完整展示，勿用过低透明度造成「像被隐藏」 */
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt:disabled {
          cursor: not-allowed;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--locked:disabled:not(.is-checked) {
          opacity: 0.78;
        }
        .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--locked.is-checked:disabled {
          opacity: 1;
        }
        .jp-vocab-teacher-quiz__level-sync-hint {
          max-width: 100%;
          font-size: 0.6875rem;
          line-height: 1.4;
          color: var(--muted);
          text-align: center;
          font-weight: 400;
        }
        .jp-vocab-teacher-quiz__level-sync-hint--desktop {
          display: block;
        }
        .jp-vocab-teacher-quiz__level-sync-hint--mobile {
          display: none;
        }
        .jp-vocab-teacher-quiz-alert-overlay {
          position: fixed;
          inset: 0;
          z-index: 1003;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
        }
        .jp-vocab-teacher-quiz-alert {
          width: min(22rem, 92vw);
          padding: 1rem 1.1rem 0.95rem;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--rise) 45%, var(--border));
          background: var(--panel);
          box-shadow:
            0 16px 40px rgba(0, 0, 0, 0.45),
            0 0 0 1px color-mix(in srgb, var(--rise) 18%, transparent) inset;
        }
        .jp-vocab-teacher-quiz-alert__title {
          margin: 0 0 0.55rem;
          font-size: 1rem;
          font-weight: 700;
          color: var(--rise);
          text-align: center;
        }
        .jp-vocab-teacher-quiz-alert__desc {
          margin: 0 0 0.85rem;
          font-size: 0.875rem;
          line-height: 1.5;
          color: var(--text);
          text-align: center;
        }
        .jp-vocab-teacher-quiz-alert__close {
          display: block;
          width: 100%;
          min-height: 2.35rem;
        }
        .jp-vocab-teacher-quiz__level-sync-status {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
          text-align: center;
        }
        .jp-vocab-teacher-quiz__level-progress {
          margin: 0.45rem auto 0;
          max-width: 100%;
        }
        .jp-vocab-teacher-quiz__stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.55rem;
          align-items: center;
          font-size: 0.75rem;
          padding: 0.35rem 0.45rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
          background: color-mix(in srgb, var(--bg) 40%, var(--panel));
        }
        .jp-vocab-teacher-quiz__stat {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
        }
        .jp-vocab-teacher-quiz__stat--weight {
          flex-wrap: wrap;
          max-width: 100%;
        }
        .jp-vocab-teacher-quiz__stat-label {
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__stat-hint {
          color: color-mix(in srgb, var(--muted) 82%, transparent);
          font-weight: 400;
        }
        .jp-vocab-teacher-quiz__risk {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-teacher-quiz__risk--high {
          color: var(--rise);
        }
        .jp-vocab-teacher-quiz__risk--mid {
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__risk--low {
          color: var(--fall);
        }
        .jp-vocab-teacher-quiz__stat-value {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }
        .jp-vocab-teacher-quiz__stat-value--active {
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__stat-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem 0.55rem;
          width: 100%;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
          padding-top: 0.15rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
        }
        .jp-vocab-teacher-quiz__examples {
          padding: 0.55rem 0.7rem;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
          background: color-mix(in srgb, var(--panel) 88%, var(--accent) 12%);
        }
        .jp-vocab-teacher-quiz__examples-head {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.25rem 0.75rem;
          margin-bottom: 0.4rem;
        }
        .jp-vocab-teacher-quiz__examples-title {
          margin: 0;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__examples-body {
          min-width: 0;
        }
        .jp-vocab-teacher-quiz__examples-body :global(.jp-vocab-source-label) {
          font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          font-size: 0.625rem;
          font-weight: 500;
          line-height: 1.25;
          letter-spacing: 0.01em;
          color: color-mix(in srgb, var(--muted) 78%, transparent);
        }
        .jp-vocab-teacher-quiz__examples-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .jp-vocab-teacher-quiz__examples-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.35rem 0.45rem;
          align-items: baseline;
        }
        .jp-vocab-teacher-quiz__examples-index {
          font-size: 0.95rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__examples-text {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          font-size: clamp(1.05rem, 3.8vw, 1.25rem);
          font-weight: 600;
          line-height: 1.55;
          letter-spacing: 0.02em;
          color: var(--text);
          word-break: break-word;
        }
        .jp-vocab-teacher-quiz__examples-gloss {
          font-size: 0.9em;
          font-weight: 500;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__examples-empty {
          margin: 0;
          font-size: 0.8125rem;
          line-height: 1.4;
          color: var(--muted);
          font-style: italic;
        }
        .jp-vocab-teacher-quiz__notes {
          padding: 0.45rem 0.6rem;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--bg);
        }
        .jp-vocab-teacher-quiz__notes-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }
        .jp-vocab-teacher-quiz__notes-actions {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .jp-vocab-teacher-quiz__notes-title {
          margin: 0;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__notes-preview {
          margin: 0;
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__notes-body {
          overflow: visible;
          font-size: 0.8125rem;
          line-height: 1.45;
        }
        .jp-vocab-teacher-quiz__nav {
          display: flex;
          gap: 0.45rem;
          padding-top: 0.15rem;
        }
        .jp-vocab-teacher-quiz__nav-btn {
          flex: 1 1 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.05rem;
          min-height: 2.35rem;
        }
        .jp-vocab-teacher-quiz__nav-btn-main {
          font-size: 0.9375rem;
          font-weight: 600;
          line-height: 1.2;
        }
        .jp-vocab-teacher-quiz__nav-btn-sub {
          display: none;
          font-size: 0.6875rem;
          font-weight: 400;
          opacity: 0.85;
          line-height: 1.2;
        }
        .jp-vocab-teacher-quiz__nav-btn--blocked:not(:disabled) {
          opacity: 0.85;
        }
        @media (max-width: 1024px) {
          .jp-vocab-teacher-quiz-overlay {
            align-items: flex-end;
            padding: 0;
            min-height: 100dvh;
          }
          .jp-vocab-teacher-quiz-card {
            width: 100%;
            border-radius: 16px 16px 0 0;
            gap: 0.4rem;
            padding: 0.65rem 0.8rem calc(0.55rem + env(safe-area-inset-bottom, 0px));
            max-height: min(92vh, 100dvh);
            overflow: hidden;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__header,
          .jp-vocab-teacher-quiz-card .jp-vocab-admin-review__today-banner,
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__level,
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__stats,
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__nav {
            flex-shrink: 0;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__scroll-body {
            display: flex;
            flex: 1 1 auto;
            min-height: 0;
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
            flex-direction: column;
            gap: 0.4rem;
            padding-right: 0.25rem;
            scrollbar-width: auto;
            scrollbar-color: color-mix(in srgb, var(--accent) 55%, var(--muted))
              color-mix(in srgb, var(--border) 70%, transparent);
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__scroll-body::-webkit-scrollbar {
            width: 8px;
            display: block;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__scroll-body::-webkit-scrollbar-track {
            background: color-mix(in srgb, var(--border) 55%, transparent);
            border-radius: 8px;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__scroll-body::-webkit-scrollbar-thumb {
            background: color-mix(in srgb, var(--accent) 50%, var(--muted));
            border-radius: 8px;
          }
          .jp-vocab-teacher-quiz__kind-prefix {
            font-size: clamp(1.05rem, 4vw, 1.25rem);
          }
          .jp-vocab-teacher-quiz__reading {
            font-size: clamp(1.45rem, 6vw, 1.85rem);
          }
          .jp-vocab-teacher-quiz__word-link.jp-vocab-teacher-quiz__reading {
            font-size: clamp(1.45rem, 6vw, 1.85rem);
          }
          .jp-vocab-teacher-quiz__kanji,
          .jp-vocab-teacher-quiz__word-main {
            font-size: clamp(1.15rem, 4.5vw, 1.45rem);
          }
          .jp-vocab-teacher-quiz__ref-hint {
            margin-top: 0.1rem;
            font-size: 0.6875rem;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-wrap {
            align-items: stretch;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-levels {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0;
            border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
            border-radius: 10px;
            overflow: hidden;
            background: color-mix(in srgb, var(--bg) 60%, var(--panel));
            width: 100%;
          }
          .jp-vocab-teacher-quiz__level-main {
            flex-direction: column;
            align-items: stretch;
            gap: 0.45rem;
          }
          .jp-vocab-teacher-quiz__actions-row {
            flex-direction: column;
            align-items: stretch;
            gap: 0.35rem;
            width: 100%;
          }
          .jp-vocab-teacher-quiz__actions-left {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.35rem;
            width: 100%;
          }
          .jp-vocab-teacher-quiz__actions-right {
            margin-left: 0;
            width: 100%;
          }
          .jp-vocab-teacher-quiz__action-btn,
          .jp-vocab-teacher-quiz__share-btn {
            width: 100%;
            min-height: 2.25rem;
            font-size: 0.8125rem;
            font-weight: 600;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt {
            min-height: 2.65rem;
            padding: 0.375rem 0.25rem;
            flex: 1 1 0;
            justify-content: center;
            font-size: clamp(0.6875rem, 3vw, 0.8125rem);
            font-weight: 500;
            border: none;
            border-radius: 0;
            border-right: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
            background: transparent;
            touch-action: manipulation;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt:last-child {
            border-right: none;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-check-box {
            display: none;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt.is-checked {
            background: color-mix(in srgb, var(--accent) 18%, var(--panel));
            color: var(--accent);
            font-weight: 600;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--very.is-checked {
            background: color-mix(in srgb, var(--fall) 16%, var(--panel));
            color: var(--fall);
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-opt--weak.is-checked {
            background: color-mix(in srgb, var(--rise) 16%, var(--panel));
            color: var(--rise);
          }
          .jp-vocab-teacher-quiz__level-sync-hint--desktop {
            display: none;
          }
          .jp-vocab-teacher-quiz__level-sync-hint--mobile {
            display: block;
            font-size: clamp(0.6875rem, 2.8vw, 0.75rem);
            padding: 0.15rem 0.25rem 0;
          }
          .jp-vocab-teacher-quiz__nav {
            gap: 0.5rem;
            padding-top: 0.2rem;
          }
          .jp-vocab-teacher-quiz__nav-btn {
            min-height: 2.75rem;
            padding: 0.5rem 0.65rem;
            border-radius: 10px;
            touch-action: manipulation;
          }
          .jp-vocab-teacher-quiz__nav-btn--prev {
            flex: 0 0 5rem;
          }
          .jp-vocab-teacher-quiz__nav-btn--next {
            flex: 1 1 auto;
          }
          .jp-vocab-teacher-quiz__nav-btn-main {
            font-size: 0.9375rem;
          }
          .jp-vocab-teacher-quiz__nav-btn-sub {
            display: block;
            font-size: 0.625rem;
          }
          .jp-vocab-teacher-quiz__header-left {
            gap: 0.25rem 0.35rem;
          }
          .jp-vocab-teacher-quiz__remaining {
            font-size: 0.6875rem;
          }
          .jp-vocab-teacher-quiz__level-label {
            font-size: clamp(0.75rem, 3vw, 0.8125rem);
            line-height: 1.45;
          }
          .jp-vocab-teacher-quiz__stats {
            gap: 0.45rem 0.65rem;
          }
          .jp-vocab-teacher-quiz__stat {
            flex: 0 1 auto;
            min-width: 0;
            justify-content: flex-start;
            gap: 0.3rem;
          }
          .jp-vocab-teacher-quiz__stat--weight {
            flex: 1 1 100%;
          }
        }
    `}</style>
  );
}
