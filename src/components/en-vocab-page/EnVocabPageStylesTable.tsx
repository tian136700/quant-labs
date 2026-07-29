"use client";

export function EnVocabPageStylesTable() {
  return (
    <style jsx global>{`
        :global(.jp-vocab-table .jp-vocab-risk-col) {
          white-space: nowrap;
          width: 4%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-risk-value) {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-vocab-table .jp-vocab-total-never) {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          max-width: 100%;
          color: var(--muted);
          font-size: 0.8125rem;
          letter-spacing: 0.02em;
          line-height: 1.15;
          white-space: normal;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-col) {
          white-space: nowrap;
          width: 4.5%;
          min-width: 0;
          text-align: center;
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
        :global(.jp-vocab-table .jp-vocab-word-col) {
          font-size: 0.875rem;
          width: 8%;
          min-width: 0;
          padding-left: 0.4rem;
          padding-right: 0.4rem;
        }
        :global(.jp-vocab-table .jp-vocab-reading-col) {
          width: 7%;
          min-width: 0;
          padding-left: 0.4rem;
          padding-right: 0.4rem;
          line-height: 1.45;
        }
        /* 竖排：喇叭+音标一行，来源角标在下一行；禁止与来源横挤导致 IPA 被拆断 */
        .en-vocab-reading-cell {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.15rem;
          width: 100%;
          max-width: 100%;
          color: var(--muted);
        }
        .en-vocab-reading-main {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          max-width: 100%;
        }
        .en-vocab-reading-text {
          flex: 0 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .en-vocab-reading-text--pending {
          font-size: 0.8125rem;
          opacity: 0.72;
          white-space: nowrap;
        }
        :global(.en-vocab-speak-btn) {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.75rem;
          height: 1.75rem;
          margin: 0;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--panel);
          color: var(--accent);
          cursor: pointer;
        }
        :global(.en-vocab-speak-btn:hover:not(:disabled)) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        :global(.en-vocab-speak-btn:disabled) {
          opacity: 0.55;
          cursor: not-allowed;
        }
        :global(.en-vocab-speak-btn.is-playing) {
          color: var(--rise);
          border-color: color-mix(in srgb, var(--rise) 45%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
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
          min-width: 0;
        }
        /* 用法/例句合并列：仅「查看」按钮，内容在弹窗；列保持窄 */
        :global(.jp-vocab-table .jp-vocab-usage-ex-col) {
          width: 6%;
          min-width: 0;
          max-width: none;
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
          overflow: hidden;
        }
        :global(.jp-vocab-table .jp-vocab-mnemonic-col) {
          width: 4%;
          min-width: 0;
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
        }
        .jp-vocab-mnemonic-empty {
          color: var(--muted);
        }
        :global(.jp-vocab-table .jp-vocab-risk-col) {
          white-space: nowrap;
          width: 4%;
          min-width: 0;
        }
        :global(.jp-vocab-table .jp-vocab-today-check-col) {
          white-space: nowrap;
          width: 4.5%;
          min-width: 0;
          text-align: center;
        }
        /* 更新时间：日期一行、时间一行（对齐新课 jp-lesson-dt-stacked）
           必须 :global —— renderEnVocabUpdatedAt 在组件外，scoped 样式挂不上会变成
           行内「07-24」「03:50」贴成「07-2403:50」再被窄列折断 */
        :global(.jp-vocab-table .jp-vocab-updated-col) {
          white-space: normal;
          width: 5%;
          min-width: 3.25rem;
          text-align: center;
          vertical-align: middle;
          font-variant-numeric: tabular-nums;
          overflow: hidden;
        }
        :global(.jp-vocab-updated-time) {
          display: inline-block;
          max-width: 100%;
          font-size: 0.8125rem;
          color: var(--muted);
          letter-spacing: -0.01em;
        }
        :global(.jp-vocab-updated-time--stacked) {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.08rem;
          line-height: 1.2;
        }
        :global(.jp-vocab-updated-date),
        :global(.jp-vocab-updated-clock) {
          display: block;
          white-space: nowrap;
        }
        :global(.jp-vocab-updated-clock) {
          font-size: 0.75rem;
          color: var(--muted);
        }
        :global(.jp-vocab-table .jp-vocab-notes-col) {
          width: 5%;
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
        /* 与日语词表一致：操作列钉在右侧，横滑时编辑/删除仍可见 */
        :global(.jp-vocab-table .jp-vocab-action-col) {
          position: sticky;
          right: 0;
          z-index: 2;
          width: 10%;
          min-width: 0;
          white-space: normal;
          background: transparent;
          box-shadow: none;
        }
        :global(.jp-vocab-table thead .jp-vocab-action-col) {
          z-index: 3;
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
        .jp-vocab-share-btn:not(:disabled) {
          color: var(--accent);
        }
        :global(.jp-vocab-table .jp-vocab-kind-col) {
          white-space: nowrap;
          width: 4%;
          min-width: 0;
        }
        :global(.jp-vocab-table .en-vocab-category-col) {
          white-space: nowrap;
          width: 5.5%;
          min-width: 0;
          font-size: 0.8125rem;
        }
        :global(.jp-vocab-table .en-vocab-upload-source-col) {
          white-space: normal;
          width: 7%;
          min-width: 0;
          font-size: 0.75rem;
          line-height: 1.25;
        }
        :global(.jp-vocab-table .jp-vocab-seq-col) {
          white-space: nowrap;
          width: 3.5%;
          min-width: 0;
          color: var(--muted);
        }
        :global(.jp-vocab-table .jp-vocab-select-col) {
          width: 2.5%;
          min-width: 0;
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

        /* 中等屏幕：提示可横滑；统计已合成单列网格，不再藏分项 */
        @media (max-width: 1100px) {
          .jp-vocab-scroll-hint {
            display: block;
          }
        }

        /* 手机 / 小屏：紧凑信息列表卡片 */
        @media (max-width: 768px) {
          .jp-vocab-scroll-hint {
            display: none;
          }
          :global(.jp-vocab-page) {
            padding-top: 1rem !important;
          }
          :global(.jp-vocab-table) {
            min-width: 0;
          }
          :global(.jp-vocab-table thead) {
            display: none;
          }
          :global(.jp-vocab-table tbody tr) {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 12px;
            padding: 14px;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: color-mix(in srgb, var(--panel) 92%, var(--bg));
          }
          :global(.jp-vocab-table tbody td) {
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            justify-content: flex-start;
            gap: 8px;
            padding: 0;
            border: none;
            text-align: left;
            line-height: 1.35;
          }
          :global(.jp-vocab-table tbody td::before) {
            content: attr(data-label) "：";
            flex: 0 0 5.5rem;
            min-width: 5rem;
            max-width: 6.25rem;
            font-size: 0.875rem;
            font-weight: 400;
            color: var(--muted);
            text-align: left;
            padding-right: 0;
          }
          :global(.jp-vocab-table tbody td.jp-vocab-field-empty) {
            display: none;
          }
          :global(.jp-vocab-table .jp-vocab-word-col) {
            order: -1;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            padding: 0 0 8px;
            margin-bottom: 2px;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-word-col::before) {
            display: none;
          }
          .jp-vocab-word-cell {
            text-align: center;
            width: 100%;
            align-items: center;
          }
          .jp-vocab-word-link,
          .jp-vocab-word-text {
            font-size: clamp(1.75rem, 8vw, 2rem);
            font-weight: 600;
            line-height: 1.2;
          }
          :global(.jp-vocab-table .jp-vocab-seq-col) {
            order: 1;
          }
          :global(.jp-vocab-table .jp-vocab-kind-col) {
            order: 2;
          }
          :global(.jp-vocab-table .en-vocab-category-col) {
            order: 2;
          }
          :global(.jp-vocab-table .en-vocab-upload-source-col) {
            order: 2;
          }
          :global(.jp-vocab-table .jp-vocab-reading-col) {
            order: 3;
            max-width: none;
          }
          :global(.jp-vocab-table .jp-vocab-meaning-col) {
            order: 4;
            max-width: none;
          }
          :global(.jp-vocab-table .jp-vocab-pos-col) {
            order: 5;
          }
          :global(.jp-vocab-table .jp-vocab-usage-ex-col) {
            order: 6;
            width: auto;
            min-width: 0;
            max-width: none;
            white-space: normal;
            text-align: left;
          }
          :global(.jp-vocab-table .jp-vocab-risk-col) {
            order: 7;
          }
          :global(.jp-vocab-table .jp-vocab-level-col) {
            order: 8;
            flex-direction: column;
            align-items: stretch;
            gap: 6px;
            padding-top: 4px;
            margin-top: 2px;
            border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-level-col::before) {
            flex: 0 0 auto;
            width: auto;
            max-width: none;
          }
          :global(.jp-vocab-table tbody td > *) {
            flex: 1;
            min-width: 0;
            font-size: 0.9375rem;
          }
          :global(.jp-vocab-table .jp-vocab-seq-cell) {
            flex-direction: row;
            align-items: center;
            gap: 0.35rem;
            min-height: 0;
          }
          :global(.jp-vocab-table .jp-vocab-kind-badge) {
            font-size: 0.9375rem;
            padding: 0;
            border: none;
            border-radius: 0;
            background: none;
            color: var(--text);
          }
          :global(.jp-vocab-table .jp-vocab-risk-badge) {
            display: inline-flex;
            align-items: center;
            flex: 0 0 auto;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 0.875rem;
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
          .jp-vocab-levels {
            justify-content: flex-start;
            width: 100%;
            gap: 12px;
          }
          .jp-vocab-level-opt {
            min-height: 2.25rem;
            padding: 4px 8px;
            flex: 0 1 auto;
            justify-content: flex-start;
            font-size: 0.875rem;
          }
          :global(.jp-vocab-table .jp-vocab-stats-col),
          :global(.jp-vocab-table .jp-vocab-today-check-col) {
            display: none;
          }
          :global(.jp-vocab-table .jp-vocab-notes-col),
          :global(.jp-vocab-table .jp-vocab-action-col) {
            order: 9;
            padding-top: 4px;
            border-top: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
          }
          :global(.jp-vocab-table .jp-vocab-action-col) {
            position: static;
            order: 10;
            border-top: none;
            padding-top: 0;
            width: auto;
          }
          :global(.jp-vocab-table .jp-vocab-notes-col.jp-vocab-field-empty) {
            display: none;
          }
          .jp-vocab-ref-hint {
            display: block;
            width: 100%;
            margin-left: 0;
            margin-top: 0.15rem;
            text-align: center;
            font-size: 0.75rem;
          }
        }

        @media (max-width: 480px) {
          :global(.jp-vocab-table tbody tr) {
            padding: 12px;
          }
        }
          `}</style>
  );
}
