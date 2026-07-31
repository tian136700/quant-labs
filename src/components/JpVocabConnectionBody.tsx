"use client";

import { parseJpVocabConnectionTableRows } from "@/lib/jp-vocab-connection-ai";

type Props = {
  /** 已挂到某条用法下、或独立接序块的接续正文 */
  text: string;
  /** 内联在「用法」下时显示「接续：」前缀；独立接序块可关 */
  showInlineLabel?: boolean;
  className?: string;
};

/**
 * 接续正文：多行「词类：说明」→ 两列表格；否则 pre-wrap 原文。
 */
export function JpVocabConnectionBody({
  text,
  showInlineLabel = true,
  className,
}: Props) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  const rows = parseJpVocabConnectionTableRows(trimmed);
  const wrapClass = ["jp-vocab-connection-body-wrap", className]
    .filter(Boolean)
    .join(" ");

  if (rows && rows.length >= 2) {
    return (
      <div className={wrapClass}>
        {showInlineLabel ? (
          <span className="jp-vocab-connection-body-label">接续：</span>
        ) : null}
        <div className="jp-vocab-connection-table-scroll">
          <table className="jp-vocab-connection-table">
            <thead>
              <tr>
                <th scope="col">词类</th>
                <th scope="col">接续</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.label}:${row.body.slice(0, 24)}`}>
                  <th scope="row">{row.label}</th>
                  <td>{row.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ConnectionBodyStyles />
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {showInlineLabel ? (
        <p className="jp-vocab-connection-body-plain">
          <span className="jp-vocab-connection-body-label">接续：</span>
          <span className="jp-vocab-connection-body-text">{trimmed}</span>
        </p>
      ) : (
        <pre className="jp-vocab-connection-body-pre">{trimmed}</pre>
      )}
      <ConnectionBodyStyles />
    </div>
  );
}

function ConnectionBodyStyles() {
  return (
    <style jsx global>{`
      .jp-vocab-connection-body-wrap {
        margin: 0 0 0.45rem;
        min-width: 0;
      }
      .jp-vocab-connection-body-label {
        font-weight: 600;
        color: color-mix(in srgb, var(--accent) 75%, var(--muted));
        font-size: 0.9375rem;
      }
      .jp-vocab-connection-body-plain {
        margin: 0;
        line-height: 1.55;
        font-size: 0.9375rem;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .jp-vocab-connection-body-text {
        color: var(--muted);
      }
      .jp-vocab-connection-body-pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font: inherit;
        color: var(--text);
        line-height: 1.55;
      }
      .jp-vocab-connection-table-scroll {
        margin-top: 0.35rem;
        overflow-x: auto;
        overflow-y: clip;
        -webkit-overflow-scrolling: touch;
        max-width: 100%;
      }
      .jp-vocab-connection-table {
        width: 100%;
        min-width: 16rem;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 0.875rem;
        line-height: 1.45;
      }
      .jp-vocab-connection-table th,
      .jp-vocab-connection-table td {
        border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
        padding: 0.4rem 0.55rem;
        vertical-align: top;
        text-align: left;
        word-break: break-word;
      }
      .jp-vocab-connection-table thead th {
        background: color-mix(in srgb, var(--panel) 88%, var(--accent));
        color: var(--text);
        font-weight: 600;
        white-space: nowrap;
      }
      .jp-vocab-connection-table tbody th {
        width: 28%;
        max-width: 7.5rem;
        background: color-mix(in srgb, var(--bg) 55%, var(--panel));
        color: var(--text);
        font-weight: 600;
      }
      .jp-vocab-connection-table tbody td {
        color: var(--muted);
      }
      @media (max-width: 767px) {
        .jp-vocab-connection-table {
          font-size: 0.8125rem;
          min-width: 14rem;
        }
        .jp-vocab-connection-table th,
        .jp-vocab-connection-table td {
          padding: 0.35rem 0.45rem;
        }
        .jp-vocab-connection-table tbody th {
          width: 32%;
          max-width: 6.5rem;
        }
      }
    `}</style>
  );
}
