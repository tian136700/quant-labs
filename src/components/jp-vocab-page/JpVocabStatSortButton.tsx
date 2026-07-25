import type { JpVocabStatSortKey } from "@/lib/jp-vocab-shared";
import { JP_VOCAB_STAT_SORT_COLUMNS } from "@/lib/jp-vocab-page-constants";

type StatSortColumn = (typeof JP_VOCAB_STAT_SORT_COLUMNS)[number];

/** 表头通用排序按钮（对齐英语 EnVocabThSortButton） */
export function JpVocabThSortButton({
  sortKey,
  statSort,
  onStatSort,
  title,
  label,
  labelLines,
}: {
  sortKey: JpVocabStatSortKey;
  statSort: { key: JpVocabStatSortKey; dir: "asc" | "desc" };
  onStatSort: (key: JpVocabStatSortKey) => void;
  title: string;
  label?: string;
  labelLines?: [string, string];
}) {
  const active = statSort?.key === sortKey;
  return (
    <button
      type="button"
      className="jp-vocab-sort-btn"
      aria-sort={
        active ? (statSort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      title={title}
      onClick={() => onStatSort(sortKey)}
    >
      {labelLines ? (
        <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
          <span>{labelLines[0]}</span>
          <span>{labelLines[1]}</span>
        </span>
      ) : (
        <span>{label}</span>
      )}
      <span className="jp-vocab-sort-indicator" aria-hidden="true">
        {active ? (statSort.dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

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
      {col.labelLines ? (
        <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact jp-vocab-stats-sort-btn__label">
          <span>{col.labelLines[0]}</span>
          <span>{col.labelLines[1]}</span>
        </span>
      ) : (
        <span className="jp-vocab-stats-sort-btn__label">{col.label}</span>
      )}
      <span className="jp-vocab-sort-indicator" aria-hidden="true">
        {active ? (statSort.dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}
