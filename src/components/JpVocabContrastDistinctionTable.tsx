"use client";

export type JpVocabContrastTableRow = {
  /** 语法/形态名（如 んです / のです） */
  form: string;
  /** 区别：何时用 */
  when: string;
};

type Props = {
  rows: JpVocabContrastTableRow[];
  /** 默认「【区别】」 */
  title?: string;
};

/**
 * 读音/形态对比课：用表格展示两侧区别（语法 / 何时用）。
 * 样式对齐接续表 `jp-vocab-conn-table`（含手机断点）。
 * 语法名单独成列，避免混在区别描述里看不清。
 */
export function JpVocabContrastDistinctionTable({
  rows,
  title = "【区别】",
}: Props) {
  if (!rows.length) return null;

  return (
    <div className="jp-vocab-contrast-table-block">
      <p className="jp-vocab-contrast-table-title">{title}</p>
      <div className="jp-vocab-conn-table-wrap jp-vocab-contrast-table-wrap">
        <table className="jp-vocab-conn-table jp-vocab-contrast-table">
          <thead>
            <tr>
              <th scope="col">语法</th>
              <th scope="col">何时用</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.form}:${row.when.slice(0, 24)}:${idx}`}>
                <th scope="row">{row.form}</th>
                <td>{row.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx global>{`
        .jp-vocab-contrast-table-block {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          min-width: 0;
          margin: 0;
        }
        .jp-vocab-contrast-table-title {
          margin: 0;
          font-weight: 600;
          font-size: 1.05rem;
          color: var(--text);
          line-height: 1.45;
        }
        .jp-vocab-contrast-table-wrap {
          overflow-x: auto;
          overflow-y: clip;
          -webkit-overflow-scrolling: touch;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
        }
        .jp-vocab-contrast-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 0.875rem;
        }
        .jp-vocab-contrast-table th,
        .jp-vocab-contrast-table td {
          padding: 0.45rem 0.55rem;
          text-align: left;
          vertical-align: top;
          border-bottom: 1px solid
            color-mix(in srgb, var(--border) 70%, transparent);
          word-break: break-word;
        }
        .jp-vocab-contrast-table thead th {
          font-weight: 600;
          color: var(--text);
          background: color-mix(in srgb, var(--accent) 6%, var(--panel));
          white-space: nowrap;
        }
        .jp-vocab-contrast-table tbody th {
          width: 30%;
          max-width: 9rem;
          font-weight: 600;
          color: var(--text);
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          white-space: nowrap;
        }
        .jp-vocab-contrast-table tbody td {
          color: var(--muted);
          line-height: 1.55;
        }
        .jp-vocab-contrast-table tbody tr:last-child th,
        .jp-vocab-contrast-table tbody tr:last-child td {
          border-bottom: none;
        }
        @media (max-width: 767px) {
          .jp-vocab-contrast-table {
            font-size: 0.8125rem;
          }
          .jp-vocab-contrast-table th,
          .jp-vocab-contrast-table td {
            padding: 0.4rem 0.45rem;
          }
          .jp-vocab-contrast-table tbody th {
            width: 34%;
            max-width: 7.5rem;
          }
        }
      `}</style>
    </div>
  );
}
