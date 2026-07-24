export function EnVocabPagination({
  show,
  safePage,
  totalPages,
  pageRangeStart,
  pageRangeEnd,
  totalItems,
  onPageChange,
}: {
  show: boolean;
  safePage: number;
  totalPages: number;
  pageRangeStart: number;
  pageRangeEnd: number;
  totalItems: number;
  onPageChange: (updater: (page: number) => number) => void;
}) {
  if (!show) return null;

  return (
    <nav className="jp-vocab-pagination" aria-label="单词表分页">
      <button
        type="button"
        className="btn-rsi-filter btn-rsi-filter--compact"
        onClick={() => onPageChange((p) => Math.max(1, p - 1))}
        disabled={safePage <= 1}
      >
        上一页
      </button>
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
    </nav>
  );
}
