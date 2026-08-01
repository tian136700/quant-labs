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
        .jp-vocab-teacher-quiz__header-right {
          display: flex;
          align-items: flex-start;
          gap: 0.45rem;
          flex-shrink: 0;
        }
        .jp-vocab-teacher-quiz__answer-timer {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.12rem;
          min-width: 4.6rem;
          padding: 0.28rem 0.5rem 0.32rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
          background:
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--bg) 55%, #0a121c 45%) 0%,
              color-mix(in srgb, var(--bg) 70%, #061018 30%) 100%
            );
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
            0 1px 2px rgba(0, 0, 0, 0.18);
        }
        .jp-vocab-teacher-quiz__answer-timer--frozen {
          border-color: color-mix(in srgb, var(--fall) 45%, var(--border));
          background:
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--bg) 60%, #0a1a14 40%) 0%,
              color-mix(in srgb, var(--bg) 75%, #06140e 25%) 100%
            );
        }
        .jp-vocab-teacher-quiz__answer-timer-label {
          font-size: 0.5625rem;
          font-weight: 600;
          line-height: 1;
          color: color-mix(in srgb, var(--muted) 88%, var(--accent) 12%);
          letter-spacing: 0.08em;
        }
        .jp-vocab-teacher-quiz__answer-timer-value {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          font-size: 1.05rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.06em;
          color: #f2b84b;
          line-height: 1.15;
          text-align: center;
        }
        .jp-vocab-teacher-quiz__answer-timer--frozen
          .jp-vocab-teacher-quiz__answer-timer-value {
          color: color-mix(in srgb, var(--fall) 75%, #9dffc4);
        }
        .jp-vocab-teacher-quiz__answer-timer--frozen
          .jp-vocab-teacher-quiz__answer-timer-label {
          color: color-mix(in srgb, var(--muted) 80%, var(--fall) 20%);
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
        /* 钉在抽查卡顶栏：学生已查看提示不随用法区滚动消失，直到点「下一个」 */
        .jp-vocab-teacher-quiz__student-peek-banner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          margin: 0.35rem 0 0;
          padding: 0.65rem 0.85rem;
          border-radius: 10px;
          border: 2px solid #f5a623;
          background: linear-gradient(
            180deg,
            color-mix(in srgb, #f5a623 42%, #1a1208) 0%,
            color-mix(in srgb, #f5a623 22%, var(--panel)) 100%
          );
          color: #ffe7a8;
          font-size: 1rem;
          font-weight: 800;
          text-align: center;
          line-height: 1.4;
          letter-spacing: 0.04em;
          box-shadow:
            0 0 0 1px color-mix(in srgb, #f5a623 45%, transparent) inset,
            0 4px 16px color-mix(in srgb, #f5a623 35%, transparent);
        }
        .jp-vocab-teacher-quiz__student-peek-banner-mark {
          color: #ffcf66;
          font-size: 0.85rem;
          line-height: 1;
          animation: jp-vocab-student-peek-pulse 1.4s ease-in-out infinite;
        }
        .jp-vocab-teacher-quiz__student-peek-banner-text {
          flex: 0 1 auto;
        }
        @keyframes jp-vocab-student-peek-pulse {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.45;
            transform: scale(0.85);
          }
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
        /* 英语卡：「单词：」与拼写同字号；音标缩小贴本行右下角 */
        .en-vocab-flashcard-reading-row {
          width: 100%;
          align-items: flex-end;
          justify-content: flex-start;
          column-gap: 0.45rem;
          row-gap: 0.15rem;
        }
        .en-vocab-flashcard-lemma-group {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: flex-start;
          column-gap: 0.2rem;
          row-gap: 0.15rem;
          min-width: 0;
        }
        .en-vocab-flashcard-kind,
        .jp-vocab-teacher-quiz__word-main.en-vocab-flashcard-lemma,
        .jp-vocab-teacher-quiz__word-link.en-vocab-flashcard-lemma {
          font-size: clamp(1.85rem, 7vw, 2.35rem);
          font-weight: 700;
          line-height: 1.25;
        }
        .en-vocab-flashcard-kind {
          margin-inline-end: 0;
        }
        .en-vocab-flashcard-lemma {
          margin-inline-start: 0;
        }
        .en-vocab-flashcard-ipa {
          margin-left: auto;
          align-self: flex-end;
          white-space: nowrap;
          font-size: clamp(0.72rem, 2.2vw, 0.85rem);
          font-weight: 400;
          line-height: 1.2;
          color: var(--muted);
        }
        .en-vocab-flashcard-ipa-source {
          margin-top: 0.15rem;
          display: flex;
          justify-content: flex-end;
        }
        /* 抽问卡：喇叭 +「播放本单词的录音」明显可点按钮 */
        .en-vocab-flashcard-speak-row {
          display: flex;
          justify-content: flex-start;
          margin-top: 0.55rem;
        }
        .en-vocab-flashcard-page .en-vocab-speak-btn,
        .en-vocab-flashcard-speak-row .en-vocab-speak-btn {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          margin: 0;
          border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 16%, var(--panel));
          color: var(--accent);
          cursor: pointer;
        }
        .en-vocab-flashcard-page .en-vocab-speak-btn--label,
        .en-vocab-flashcard-speak-row .en-vocab-speak-btn--label {
          width: auto;
          max-width: 100%;
          height: auto;
          min-height: 2.5rem;
          padding: 0.5rem 0.95rem;
          border-radius: 10px;
          border-width: 1.5px;
          font-size: 0.9375rem;
          font-weight: 700;
          line-height: 1.2;
          white-space: nowrap;
          box-shadow: 0 1px 0 color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .en-vocab-flashcard-page .en-vocab-speak-btn--label :global(svg),
        .en-vocab-flashcard-speak-row .en-vocab-speak-btn--label :global(svg) {
          flex: 0 0 auto;
        }
        .en-vocab-flashcard-page .en-vocab-speak-btn:hover:not(:disabled),
        .en-vocab-flashcard-speak-row .en-vocab-speak-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 26%, var(--panel));
          border-color: color-mix(in srgb, var(--accent) 72%, var(--border));
        }
        .en-vocab-flashcard-page .en-vocab-speak-btn:active:not(:disabled),
        .en-vocab-flashcard-speak-row .en-vocab-speak-btn:active:not(:disabled) {
          transform: translateY(1px);
        }
        .en-vocab-flashcard-page .en-vocab-speak-btn:disabled,
        .en-vocab-flashcard-speak-row .en-vocab-speak-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
        }
        .en-vocab-flashcard-page .en-vocab-speak-btn.is-playing,
        .en-vocab-flashcard-speak-row .en-vocab-speak-btn.is-playing {
          color: var(--rise);
          border-color: color-mix(in srgb, var(--rise) 55%, var(--border));
          background: color-mix(in srgb, var(--rise) 14%, var(--panel));
        }
        /*
         * 英语抽问：近全屏网页式弹层（仅 .en-vocab-flashcard-page*）
         * 窄卡片备份：EnVocabTeacherQuizFlashcardModal.card-compact.tsx
         * 顶栏 +「上一个/下一个」钉住；中间（用法+备注/熟悉程度/统计）滚动。
         * 备注/两框不要钉底；导航按钮窗格必须固定可见。
         */
        .en-vocab-flashcard-page-overlay {
          align-items: stretch;
          justify-content: center;
          padding: clamp(0.35rem, 1.2vw, 0.75rem);
        }
        .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page {
          width: min(72rem, 98vw);
          max-width: 98vw;
          height: min(96vh, 100dvh);
          max-height: min(96vh, 100dvh);
          margin: 0 auto;
          gap: 0.45rem;
          padding: 0.85rem 1.1rem 0.9rem;
          border-radius: 14px;
          overflow: hidden;
          overscroll-behavior: contain;
        }
        .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
          .jp-vocab-teacher-quiz__header,
        .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
          .en-vocab-flashcard-page__nav {
          flex: 0 0 auto;
          flex-wrap: wrap;
        }
        .en-vocab-flashcard-page__nav-progress {
          flex: 1 0 100%;
          width: 100%;
          margin: 0 0 0.35rem;
        }
        .en-vocab-flashcard-page__scroll {
          display: flex;
          flex: 1 1 0;
          flex-direction: column;
          gap: 0.55rem;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }
        .en-vocab-flashcard-page .en-vocab-flashcard-page__body,
        .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
          .jp-vocab-teacher-quiz__scroll-body {
          display: flex;
          flex: 0 0 auto;
          min-height: 0;
          overflow: visible;
          flex-direction: column;
          gap: 0.55rem;
        }
        .en-vocab-flashcard-page__grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
          gap: 0.75rem 1.35rem;
          align-items: start;
          min-width: 0;
          flex: 0 0 auto;
        }
        .en-vocab-flashcard-page__grid--single {
          grid-template-columns: minmax(0, 1fr);
        }
        .en-vocab-flashcard-page__col-main,
        .en-vocab-flashcard-page__col-side {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          min-width: 0;
        }
        .en-vocab-flashcard-page__col-side .jp-vocab-teacher-quiz__examples {
          margin: 0;
        }
        .en-vocab-flashcard-page .en-vocab-flashcard-kind,
        .en-vocab-flashcard-page
          .jp-vocab-teacher-quiz__word-main.en-vocab-flashcard-lemma,
        .en-vocab-flashcard-page
          .jp-vocab-teacher-quiz__word-link.en-vocab-flashcard-lemma {
          font-size: clamp(2rem, 3.2vw, 2.75rem);
        }
        .en-vocab-flashcard-page .en-vocab-flashcard-ipa {
          font-size: clamp(0.85rem, 1.4vw, 1.05rem);
        }
        .en-vocab-flashcard-page .jp-vocab-teacher-quiz__meta {
          font-size: 1.05rem;
        }
        .en-vocab-flashcard-page .jp-vocab-teacher-quiz__examples-text,
        .en-vocab-flashcard-page .en-usage-ex-paired-usage,
        .en-vocab-flashcard-page .en-usage-ex-paired-en {
          font-size: 1.02rem;
        }
        .en-vocab-flashcard-page-footer {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          flex: 0 0 auto;
          min-width: 0;
        }
        /* 备注：桌面在释义下；手机在抽查优先级块底（两份 DOM，按断点互斥） */
        .en-vocab-flashcard-page__notes {
          margin: 0;
          min-width: 0;
        }
        .en-vocab-flashcard-page .en-vocab-flashcard-page__notes-body,
        .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
          .jp-vocab-teacher-quiz__notes-body {
          max-height: min(14rem, 32vh);
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding-right: 0.15rem;
          font-size: 0.8125rem;
          line-height: 1.45;
        }
        .en-vocab-flashcard-page__notes--mobile,
        .en-vocab-flashcard-page-footer__notes {
          display: none;
          margin: 0;
        }
        @media (min-width: 1025px) {
          .en-vocab-flashcard-page__notes--desktop {
            display: block;
          }
          .en-vocab-flashcard-page__notes--mobile,
          .en-vocab-flashcard-page-footer__notes {
            display: none !important;
          }
        }
        .en-vocab-flashcard-page-footer__panels {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          min-width: 0;
        }
        @media (min-width: 1025px) {
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page {
            width: min(76rem, 96vw);
            height: min(94vh, 100dvh);
            max-height: min(94vh, 100dvh);
            padding: 1rem 1.35rem 1.05rem;
            gap: 0.5rem;
            overflow: hidden;
          }
          .en-vocab-flashcard-page-overlay {
            align-items: center;
            padding: clamp(0.5rem, 1.5vw, 1rem);
          }
          /* 宽屏：熟悉程度 + 统计并排（自然高度）；备注在两框上方，随中间区滚动 */
          .en-vocab-flashcard-page-footer__panels {
            display: grid;
            grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
            gap: 0.65rem 1rem;
            align-items: start;
          }
        }
        @media (max-width: 1024px) {
          /* 压过日语底栏抽屉的 flex-end；禁止整层滚动，只滚中间 __scroll */
          .jp-vocab-teacher-quiz-overlay.en-vocab-flashcard-page-overlay {
            align-items: stretch;
            justify-content: stretch;
            padding: 0;
            height: 100dvh;
            height: 100svh;
            max-height: 100dvh;
            max-height: 100svh;
            overflow: hidden;
          }
          .en-vocab-flashcard-page-overlay {
            align-items: stretch;
            padding: 0;
          }
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page {
            width: 100%;
            max-width: 100%;
            /* 勿用 100vh：Chrome 地址栏会把卡片撑高，导航下留一大块黑底 */
            height: 100%;
            max-height: 100%;
            min-height: 0;
            margin: 0;
            border-radius: 0;
            padding: calc(0.55rem + env(safe-area-inset-top, 0px))
              calc(0.8rem + env(safe-area-inset-right, 0px))
              calc(0.55rem + env(safe-area-inset-bottom, 0px))
              calc(0.8rem + env(safe-area-inset-left, 0px));
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
            .en-vocab-flashcard-page__scroll {
            flex: 1 1 0;
            min-height: 0;
          }
          /* 兜底：即使中间区未吃满，导航也贴卡片底，避免「下一个」下大块空白 */
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
            .en-vocab-flashcard-page__nav {
            margin-top: auto;
            flex: 0 0 auto;
          }
          .en-vocab-flashcard-page__grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 0.5rem;
          }
          .en-vocab-flashcard-page .en-vocab-flashcard-kind,
          .en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__word-main.en-vocab-flashcard-lemma,
          .en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__word-link.en-vocab-flashcard-lemma {
            font-size: clamp(1.65rem, 7vw, 2.1rem);
          }
          /* 触控：关闭 / 播放按钮 ≥ 44px；文字按钮勿锁死方块宽高 */
          .en-vocab-flashcard-page .jp-vocab-teacher-quiz__close-x {
            width: 2.75rem;
            height: 2.75rem;
            font-size: 1.45rem;
            border-radius: 8px;
            touch-action: manipulation;
          }
          .en-vocab-flashcard-page
            .en-vocab-speak-btn:not(.en-vocab-speak-btn--label) {
            width: 2.75rem;
            height: 2.75rem;
            touch-action: manipulation;
          }
          .en-vocab-flashcard-page .en-vocab-speak-btn--label {
            min-height: 3rem;
            padding: 0.65rem 1rem;
            font-size: 1rem;
            border-radius: 12px;
            touch-action: manipulation;
          }
          .en-vocab-flashcard-page .jp-vocab-teacher-quiz__actions-left {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .en-vocab-flashcard-page .jp-vocab-teacher-quiz__action-btn,
          .en-vocab-flashcard-page .jp-vocab-teacher-quiz__share-btn {
            min-height: 2.75rem;
          }
          /* 顶栏：进度条已有次数，隐藏重复小字；学生提示条收紧 */
          .en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__header-left
            .jp-vocab-teacher-quiz__progress,
          .en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__header-left
            .jp-vocab-teacher-quiz__remaining {
            display: none;
          }
          .en-vocab-flashcard-page .jp-vocab-teacher-quiz__student-peek-banner {
            padding: 0.4rem 0.55rem;
            font-size: 0.8125rem;
            font-weight: 700;
          }
          /* 手机：释义下备注藏起；抽查优先级块底那份显示 */
          .en-vocab-flashcard-page__notes--desktop {
            display: none !important;
          }
          .en-vocab-flashcard-page__notes--mobile,
          .en-vocab-flashcard-page-footer__notes {
            display: block !important;
            margin-top: 0.65rem;
            padding-top: 0.55rem;
            border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
            width: 100%;
          }
          .en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__stats
            .en-vocab-flashcard-page__notes-body {
            max-height: min(12rem, 28vh);
          }
          /* 用法旁熟悉程度：独立 3 列触控条 + 勾选框（外框用 accent，勿用 rise 红以免像告警） */
          .en-vocab-flashcard-page .en-usage-ex-paired-levels.jp-vocab-levels {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.35rem;
            width: 100%;
            flex-wrap: nowrap;
            margin: 0.3rem 0 0.6rem;
            padding: 0.4rem;
            border: 2px solid color-mix(in srgb, var(--accent) 55%, var(--border));
            border-radius: 12px;
            overflow: visible;
            background: color-mix(in srgb, var(--accent) 12%, var(--panel));
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
          }
          .en-vocab-flashcard-page
            .en-usage-ex-paired-levels
            .jp-vocab-level-opt {
            min-height: 2.85rem;
            padding: 0.4rem 0.25rem;
            flex: 1 1 0;
            justify-content: center;
            gap: 0.28rem;
            font-size: clamp(0.6875rem, 3vw, 0.8125rem);
            font-weight: 600;
            border: 1.5px solid color-mix(in srgb, var(--accent) 40%, var(--border));
            border-radius: 8px;
            background: color-mix(in srgb, var(--bg) 88%, #fff 12%);
            box-shadow: 0 1px 0 color-mix(in srgb, #000 12%, transparent);
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
          }
          .en-vocab-flashcard-page
            .en-usage-ex-paired-levels
            .jp-vocab-level-opt:last-child {
            border-right: 1.5px solid color-mix(in srgb, var(--accent) 40%, var(--border));
          }
          .en-vocab-flashcard-page
            .en-usage-ex-paired-levels
            .jp-vocab-level-opt:active:not(:disabled) {
            transform: scale(0.97);
          }
          .en-vocab-flashcard-page
            .en-usage-ex-paired-levels
            .jp-vocab-level-opt.is-checked {
            border-color: var(--accent);
            background: color-mix(in srgb, var(--accent) 16%, var(--bg));
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
          }
          .en-vocab-flashcard-page
            .en-usage-ex-paired-levels
            .jp-vocab-level-opt--very.is-checked {
            border-color: var(--fall);
            background: color-mix(in srgb, var(--fall) 16%, var(--bg));
            color: var(--fall);
          }
          .en-vocab-flashcard-page
            .en-usage-ex-paired-levels
            .jp-vocab-level-opt--weak.is-checked {
            border-color: var(--rise);
            background: color-mix(in srgb, var(--rise) 16%, var(--bg));
            color: var(--rise);
          }
          .en-vocab-flashcard-page
            .en-usage-ex-paired-levels
            .jp-vocab-check-box {
            display: inline-flex;
            width: 1.05rem;
            height: 1.05rem;
            border-width: 2px;
            border-radius: 4px;
          }
          /* 底栏整词熟悉程度（无编号用法时）：同样做成明显可点芯片 */
          .en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__level
            .jp-vocab-levels {
            gap: 0.4rem;
          }
          .en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__level
            .jp-vocab-level-opt {
            min-height: 2.85rem;
            padding: 0.45rem 0.65rem;
            font-weight: 600;
            border: 1.5px solid color-mix(in srgb, var(--accent) 40%, var(--border));
            border-radius: 8px;
            background: color-mix(in srgb, var(--bg) 88%, #fff 12%);
            box-shadow: 0 1px 0 color-mix(in srgb, #000 12%, transparent);
            touch-action: manipulation;
          }
          .en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__level
            .jp-vocab-check-box {
            width: 1.05rem;
            height: 1.05rem;
            border-width: 2px;
          }
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
          color: var(--rise);
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
        .jp-vocab-teacher-quiz__risk--never {
          color: var(--muted);
          font-weight: 500;
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
          align-items: center;
          justify-content: space-between;
          gap: 0.25rem 0.75rem;
          margin-bottom: 0.4rem;
        }
        .jp-vocab-teacher-quiz__examples-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__examples-body {
          min-width: 0;
        }
        .jp-vocab-teacher-quiz__connection {
          padding: 0.55rem 0.7rem;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 30%);
          background: color-mix(in srgb, var(--panel) 92%, var(--muted) 8%);
        }
        .jp-vocab-teacher-quiz__connection-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.25rem 0.75rem;
          margin-bottom: 0.35rem;
        }
        .jp-vocab-teacher-quiz__connection-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--accent);
        }
        .jp-vocab-teacher-quiz__connection-body {
          min-width: 0;
        }
        .jp-vocab-teacher-quiz__connection-text {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: inherit;
          font-size: 1.05rem;
          line-height: 1.65;
          color: var(--text);
        }
        .jp-vocab-teacher-quiz__connection-empty {
          margin: 0;
          color: var(--muted);
          font-size: 0.95rem;
        }
        @media (max-width: 767px) {
          .jp-vocab-teacher-quiz__connection-text {
            font-size: 1rem;
            line-height: 1.6;
          }
        }
        /* 语法「用法/例句」配对：字号对齐单词例句区，避免 0.9rem 过小 */
        .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-usage),
        .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-fallback) {
          font-size: 1.125rem;
          line-height: 1.65;
        }
        /* 接续弱于用法：更小 + muted，避免和正文抢视线 */
        .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-connection) {
          font-size: 0.9375rem;
          line-height: 1.55;
        }
        .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-connection-label) {
          color: color-mix(in srgb, var(--accent) 75%, var(--muted));
        }
        .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-connection-body) {
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-jp) {
          font-size: clamp(1.05rem, 3.2vw, 1.2rem);
          font-weight: 600;
          line-height: 1.8;
        }
        .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-gloss) {
          font-size: 0.98rem;
          line-height: 1.5;
        }
        .jp-vocab-teacher-quiz__examples-body :global(.jp-vocab-furigana-reading) {
          font-size: 0.55em;
        }
        .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-nested-index) {
          font-size: 1.05rem;
          line-height: 1.8;
        }
        @media (max-width: 767px) {
          .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-usage),
          .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-fallback) {
            font-size: 1.15rem;
          }
          .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-connection) {
            font-size: 0.98rem;
          }
          .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-jp) {
            font-size: 1.15rem;
          }
          .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-gloss) {
            font-size: 1.02rem;
          }
          .jp-vocab-teacher-quiz__examples-body :global(.jp-usage-ex-paired-nested-index) {
            font-size: 1.1rem;
          }
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
          line-height: 1.95;
          letter-spacing: 0.02em;
          color: var(--text);
          word-break: break-word;
        }
        .jp-vocab-teacher-quiz__examples-primary {
          line-height: 1.95;
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
        .jp-vocab-teacher-quiz__annotation {
          padding: 0.35rem 0.6rem;
          border-radius: 10px;
          border: 1px dashed var(--border);
          background: transparent;
        }
        .jp-vocab-teacher-quiz__annotation-title {
          margin: 0 0 0.15rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__annotation-value {
          margin: 0;
          font-size: 0.8125rem;
          line-height: 1.4;
          color: var(--text);
        }
        .jp-vocab-teacher-quiz__meta-after-notes {
          display: flex;
          flex-direction: column;
          gap: 0.28rem;
          padding: 0.4rem 0.6rem;
          border-radius: 10px;
          border: 1px dashed var(--border);
          background: transparent;
        }
        .jp-vocab-teacher-quiz__meta-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-height: 1.25rem;
        }
        .jp-vocab-teacher-quiz__meta-label {
          flex: 0 0 auto;
          min-width: 4.5rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--muted);
        }
        .jp-vocab-teacher-quiz__meta-value {
          flex: 1 1 auto;
          min-width: 0;
          font-size: 0.8125rem;
          line-height: 1.35;
          color: var(--text);
          overflow-wrap: anywhere;
        }
        .jp-vocab-teacher-quiz__meta-empty {
          min-height: 1em;
        }
        .jp-vocab-teacher-quiz__meta-freq {
          flex: 1 1 auto;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .jp-vocab-teacher-quiz__meta-freq-bar {
          flex: 1 1 auto;
          min-width: 3.5rem;
          max-width: 8rem;
          height: 0.35rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--muted) 18%, transparent);
          overflow: hidden;
        }
        .jp-vocab-teacher-quiz__meta-freq-fill {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: color-mix(in srgb, var(--accent, #3b82f6) 75%, transparent);
        }
        .jp-vocab-teacher-quiz__meta-freq-score {
          flex: 0 0 auto;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-teacher-quiz__course-label {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          padding: 0.15rem 0.1rem 0.05rem;
          margin-top: 0.1rem;
        }
        .jp-vocab-teacher-quiz__course-label-tag {
          display: inline-block;
          max-width: 100%;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          background: color-mix(in srgb, var(--muted) 8%, transparent);
          color: var(--muted);
          font-size: 0.6875rem;
          font-weight: 500;
          line-height: 1.35;
          overflow-wrap: anywhere;
          opacity: 0.9;
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
          .jp-vocab-teacher-quiz__answer-timer {
            min-width: 4.1rem;
            padding: 0.22rem 0.4rem 0.26rem;
          }
          .jp-vocab-teacher-quiz__answer-timer-value {
            font-size: 0.95rem;
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
          .en-vocab-flashcard-kind,
          .jp-vocab-teacher-quiz__word-main.en-vocab-flashcard-lemma,
          .jp-vocab-teacher-quiz__word-link.en-vocab-flashcard-lemma {
            font-size: clamp(1.55rem, 6.5vw, 1.95rem);
            font-weight: 700;
          }
          .en-vocab-flashcard-ipa {
            font-size: clamp(0.68rem, 2.4vw, 0.8rem);
          }
          .en-vocab-flashcard-reading-row {
            column-gap: 0.35rem;
            row-gap: 0.12rem;
          }
          .jp-vocab-teacher-quiz__ref-hint {
            margin-top: 0.1rem;
            font-size: 0.6875rem;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-level-wrap {
            align-items: stretch;
          }
          .jp-vocab-teacher-quiz-card .jp-vocab-teacher-quiz__level .jp-vocab-levels {
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
          .jp-vocab-teacher-quiz-card
            .jp-vocab-teacher-quiz__level
            .jp-vocab-level-opt {
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
          .jp-vocab-teacher-quiz-card
            .jp-vocab-teacher-quiz__level
            .jp-vocab-level-opt:last-child {
            border-right: none;
          }
          .jp-vocab-teacher-quiz-card
            .jp-vocab-teacher-quiz__level
            .jp-vocab-check-box {
            display: none;
          }
          /* 英语抽查卡：手机熟悉程度保留勾选框 + 芯片态，避免像纯文字 */
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__level
            .jp-vocab-levels {
            gap: 0.4rem;
            padding: 0.35rem;
            border: 2px solid color-mix(in srgb, var(--accent) 45%, var(--border));
            border-radius: 12px;
            overflow: visible;
            background: color-mix(in srgb, var(--accent) 10%, var(--panel));
          }
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__level
            .jp-vocab-level-opt {
            border: 1.5px solid color-mix(in srgb, var(--accent) 40%, var(--border));
            border-radius: 8px;
            border-right: 1.5px solid color-mix(in srgb, var(--accent) 40%, var(--border));
            background: color-mix(in srgb, var(--bg) 88%, #fff 12%);
            box-shadow: 0 1px 0 color-mix(in srgb, #000 12%, transparent);
            font-weight: 600;
            gap: 0.28rem;
          }
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__level
            .jp-vocab-level-opt:last-child {
            border-right: 1.5px solid color-mix(in srgb, var(--accent) 40%, var(--border));
          }
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__level
            .jp-vocab-check-box {
            display: inline-flex;
            width: 1.05rem;
            height: 1.05rem;
            border-width: 2px;
            border-radius: 4px;
          }
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
            .en-usage-ex-paired-levels
            .jp-vocab-check-box {
            display: inline-flex;
          }
          .jp-vocab-teacher-quiz-card
            .jp-vocab-teacher-quiz__level
            .jp-vocab-level-opt.is-checked {
            background: color-mix(in srgb, var(--accent) 18%, var(--panel));
            color: var(--accent);
            font-weight: 600;
          }
          .jp-vocab-teacher-quiz-card
            .jp-vocab-teacher-quiz__level
            .jp-vocab-level-opt--very.is-checked {
            background: color-mix(in srgb, var(--fall) 16%, var(--panel));
            color: var(--fall);
          }
          .jp-vocab-teacher-quiz-card
            .jp-vocab-teacher-quiz__level
            .jp-vocab-level-opt--weak.is-checked {
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
