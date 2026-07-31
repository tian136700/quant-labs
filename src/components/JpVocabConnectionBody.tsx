"use client";

import {
  parseJpVocabConnectionTableRows,
} from "@/lib/jp-vocab-connection-ai";

type Props = {
  /** 已 normalize / 按用法拆好的接续正文 */
  text: string;
  /** 内联在用法下时显示「接续：」；独立接序块可不显示 */
  showLabel?: boolean;
  labelText?: string;
  className?: string;
};

/**
 * 接续正文：多行「词类：说明」或「词类＋接续；…」→ 两列表格；否则 pre-wrap 原文。
 */
export function JpVocabConnectionBody({
  text,
  showLabel = true,
  labelText = "接续：",
  className,
}: Props) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const rows = parseJpVocabConnectionTableRows(trimmed);

  return (
    <div
      className={`jp-vocab-conn-body${className ? ` ${className}` : ""}`}
    >
      {showLabel ? (
        <span className="jp-vocab-conn-body-label">{labelText}</span>
      ) : null}
      {rows ? (
        <div className="jp-vocab-conn-table-wrap">
          <table className="jp-vocab-conn-table">
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
      ) : (
        <span className="jp-vocab-conn-body-text">{trimmed}</span>
      )}

      <style jsx global>{`
        .jp-vocab-conn-body {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          min-width: 0;
          margin: 0 0 0.45rem;
          line-height: 1.55;
          font-size: 0.9375rem;
        }
        .jp-vocab-conn-body-label {
          font-weight: 600;
          color: color-mix(in srgb, var(--accent) 75%, var(--muted));
        }
        .jp-vocab-conn-body-text {
          color: var(--muted);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .jp-vocab-conn-table-wrap {
          overflow-x: auto;
          overflow-y: clip;
          -webkit-overflow-scrolling: touch;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
        }
        .jp-vocab-conn-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 0.875rem;
        }
        .jp-vocab-conn-table th,
        .jp-vocab-conn-table td {
          padding: 0.45rem 0.55rem;
          text-align: left;
          vertical-align: top;
          border-bottom: 1px solid
            color-mix(in srgb, var(--border) 70%, transparent);
          word-break: break-word;
        }
        .jp-vocab-conn-table thead th {
          font-weight: 600;
          color: var(--text);
          background: color-mix(in srgb, var(--accent) 6%, var(--panel));
          white-space: nowrap;
        }
        .jp-vocab-conn-table tbody th {
          width: 28%;
          max-width: 7.5rem;
          font-weight: 600;
          color: var(--text);
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
        }
        .jp-vocab-conn-table tbody td {
          color: var(--muted);
        }
        .jp-vocab-conn-table tbody tr:last-child th,
        .jp-vocab-conn-table tbody tr:last-child td {
          border-bottom: none;
        }
        @media (max-width: 767px) {
          .jp-vocab-conn-table {
            font-size: 0.8125rem;
          }
          .jp-vocab-conn-table th,
          .jp-vocab-conn-table td {
            padding: 0.4rem 0.45rem;
          }
          .jp-vocab-conn-table tbody th {
            width: 32%;
            max-width: 6.5rem;
          }
        }
      `}</style>
    </div>
  );
}
