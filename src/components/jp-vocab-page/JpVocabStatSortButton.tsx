import type { JpVocabStatSortKey } from "@/lib/jp-vocab-shared";
import { JP_VOCAB_STAT_SORT_COLUMNS } from "@/lib/jp-vocab-page-constants";

type StatSortColumn = (typeof JP_VOCAB_STAT_SORT_COLUMNS)[number];

export function JpVocabStatSortButton({
  col,
  statSort,
  onSort,
}: {
  col: StatSortColumn;
  statSort: { key: JpVocabStatSortKey; dir: "asc" | "desc" } | null;
  onSort: (key: JpVocabStatSortKey) => void;
}) {
  const active = statSort?.key === col.key;
  const ariaSort = active
    ? statSort.dir === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <button
      type="button"
      className="jp-vocab-stats-sort-btn"
      aria-sort={ariaSort}
      title={`按${col.label}排序`}
      onClick={() => onSort(col.key)}
    >
      <span className="jp-vocab-stats-sort-btn__label">{col.label}</span>
      <span className="jp-vocab-sort-indicator" aria-hidden="true">
        {active ? (statSort.dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}
