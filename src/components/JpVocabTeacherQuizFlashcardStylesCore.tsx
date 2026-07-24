"use client";

export function JpVocabTeacherQuizFlashcardStylesCore() {
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
        /*
         * 英语抽问：近全屏网页式弹层（仅 .en-vocab-flashcard-page*）
         * 窄卡片备份：EnVocabTeacherQuizFlashcardModal.card-compact.tsx
         * 顶栏+底栏（备注/熟悉程度/统计/上下一词）钉住；中间用法区滚动。
         * 禁止再改回「整卡 overflow-y:auto」——多用法词会把「下一个」顶出视口，
         * 老师勾完熟悉程度却无法继续（align-items:center 时甚至滚不到底）。
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
        .en-vocab-flashcard-page .en-vocab-flashcard-page__body,
        .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
          .jp-vocab-teacher-quiz__scroll-body {
          display: flex;
          flex: 1 1 auto;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
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
        .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
          .jp-vocab-teacher-quiz__header,
        .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
          .en-vocab-flashcard-page-footer,
        .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
          .jp-vocab-teacher-quiz__nav {
          flex: 0 0 auto;
        }
        .en-vocab-flashcard-page-footer__notes {
          margin: 0;
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
          /* 与日语桌面卡同构：中间滚、顶栏/底栏钉住（保证「下一个」始终可见） */
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page
            .jp-vocab-teacher-quiz__scroll-body {
            display: flex;
            flex: 1 1 auto;
            min-height: 0;
            overflow-x: hidden;
            overflow-y: auto;
            padding-right: 0.35rem;
            margin-right: -0.1rem;
          }
          /* 宽屏：熟悉程度 + 统计并排；备注在两框上方（勿放到两框下面） */
          .en-vocab-flashcard-page-footer__panels {
            display: grid;
            grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
            gap: 0.65rem 1rem;
            align-items: stretch;
          }
          .en-vocab-flashcard-page-footer__panels .jp-vocab-teacher-quiz__level,
          .en-vocab-flashcard-page-footer__panels .jp-vocab-teacher-quiz__stats {
            height: 100%;
          }
        }
        @media (max-width: 1024px) {
          .en-vocab-flashcard-page-overlay {
            align-items: stretch;
            padding: 0;
          }
          .jp-vocab-teacher-quiz-card.en-vocab-flashcard-page {
            width: 100%;
            max-width: 100%;
            height: min(100dvh, 100vh);
            max-height: min(100dvh, 100vh);
            border-radius: 0;
            padding: 0.65rem 0.8rem calc(0.55rem + env(safe-area-inset-bottom, 0px));
            overflow: hidden;
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
    `}</style>
  );
}
