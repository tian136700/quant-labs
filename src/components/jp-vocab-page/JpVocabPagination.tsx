import { JP_VOCAB_PAGE_SIZE_OPTIONS } from "@/lib/jp-vocab-page-constants";

function PageSizeSelect({
  pageSize,
  onPageSizeChange,
}: {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}) {
  return (
    <label className="jp-vocab-pagination__size">
      <span className="jp-vocab-pagination__size-label">每页</span>
      <select
        className="jp-vocab-pagination__size-select"
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        aria-label="每页显示条数"
      >
        {JP_VOCAB_PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size} 条
          </option>
        ))}
      </select>
    </label>
  );
}

export function JpVocabPagination({
  safePage,
  totalPages,
  pageRangeStart,
  pageRangeEnd,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  safePage: number;
  totalPages: number;
  pageRangeStart: number;
  pageRangeEnd: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (updater: (page: number) => number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  if (totalItems <= 0) return null;

  const showPageNav = totalPages > 1;

  return (
    <nav className="jp-vocab-pagination" aria-label="单词表分页">
      <div className="jp-vocab-pagination__controls">
        {showPageNav ? (
          <>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => onPageChange((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              上一页
            </button>
            <PageSizeSelect
              pageSize={pageSize}
              onPageSizeChange={onPageSizeChange}
            />
            <span className="jp-vocab-pagination__info">
              第 {safePage} / {totalPages} 页 · 显示 {pageRangeStart}–{pageRangeEnd} /{" "}
              {totalItems} 条
            </span>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              下一页
            </button>
          </>
        ) : (
          <>
            <PageSizeSelect
              pageSize={pageSize}
              onPageSizeChange={onPageSizeChange}
            />
            <span className="jp-vocab-pagination__info">
              显示 {pageRangeStart}–{pageRangeEnd} / {totalItems} 条
            </span>
          </>
        )}
      </div>
    </nav>
  );
}
