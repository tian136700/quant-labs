"use client";

import type { VisitLogSortField, VisitLogSortOrder } from "@/lib/analytics-db";

export type AdminVisitSortState = {
  field: VisitLogSortField;
  order: VisitLogSortOrder;
};

export function nextVisitSortState(
  current: AdminVisitSortState,
  field: VisitLogSortField
): AdminVisitSortState {
  if (current.field === field) {
    return { field, order: current.order === "desc" ? "asc" : "desc" };
  }
  return { field, order: "desc" };
}

export function AdminVisitSortTh({
  field,
  label,
  sort,
  onSort,
}: {
  field: VisitLogSortField;
  label: string;
  sort: AdminVisitSortState;
  onSort: (field: VisitLogSortField) => void;
}) {
  const active = sort.field === field;
  return (
    <th>
      <button
        type="button"
        className={`admin-sort-btn${active ? " admin-sort-btn--active" : ""}`}
        onClick={() => onSort(field)}
        aria-sort={
          active ? (sort.order === "desc" ? "descending" : "ascending") : "none"
        }
      >
        {label}
        <span className="admin-sort-indicator" aria-hidden="true">
          {active ? (sort.order === "desc" ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </th>
  );
}
