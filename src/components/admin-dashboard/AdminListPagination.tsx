/** 通用后台列表分页：布局对齐 JpVocabPagination（上一页 · 每页 · 摘要 · 下一页）。 */

export const ADMIN_LIST_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type AdminListPaginationLabels = {
  prev: string;
  next: string;
  /** 多页：第 {page} / {totalPages} 页 · 显示 {from}–{to} / {total} 条 */
  summaryMulti: string;
  /** 单页：显示 {from}–{to} / {total} 条 */
  summarySingle: string;
  pageSizeLabel: string;
  pageSizeOption: string;
  pageSizeAria: string;
  ariaLabel: string;
};

function formatLabel(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(vars[key] ?? "")
  );
}

function PageSizeSelect({
  pageSize,
  onPageSizeChange,
  labels,
}: {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  labels: Pick<
    AdminListPaginationLabels,
    "pageSizeLabel" | "pageSizeOption" | "pageSizeAria"
  >;
}) {
  return (
    <label className="admin-pagination__size">
      <span className="admin-pagination__size-label">{labels.pageSizeLabel}</span>
      <select
        className="admin-pagination__size-select"
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        aria-label={labels.pageSizeAria}
      >
        {ADMIN_LIST_PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {formatLabel(labels.pageSizeOption, { size })}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AdminListPagination({
  safePage,
  totalPages,
  pageRangeStart,
  pageRangeEnd,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  labels,
  disabled = false,
}: {
  safePage: number;
  totalPages: number;
  pageRangeStart: number;
  pageRangeEnd: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  labels: AdminListPaginationLabels;
  disabled?: boolean;
}) {
  if (totalItems <= 0) return null;

  const showPageNav = totalPages > 1;

  return (
    <nav className="admin-pagination" aria-label={labels.ariaLabel}>
      <div className="admin-pagination__controls">
        {showPageNav ? (
          <>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={disabled || safePage <= 1}
            >
              {labels.prev}
            </button>
            <PageSizeSelect
              pageSize={pageSize}
              onPageSizeChange={onPageSizeChange}
              labels={labels}
            />
            <span className="admin-pagination__info">
              {formatLabel(labels.summaryMulti, {
                page: safePage,
                totalPages,
                from: pageRangeStart,
                to: pageRangeEnd,
                total: totalItems,
              })}
            </span>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              disabled={disabled || safePage >= totalPages}
            >
              {labels.next}
            </button>
          </>
        ) : (
          <>
            <PageSizeSelect
              pageSize={pageSize}
              onPageSizeChange={onPageSizeChange}
              labels={labels}
            />
            <span className="admin-pagination__info">
              {formatLabel(labels.summarySingle, {
                from: pageRangeStart,
                to: pageRangeEnd,
                total: totalItems,
              })}
            </span>
          </>
        )}
      </div>
    </nav>
  );
}
