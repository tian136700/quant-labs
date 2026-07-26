#!/usr/bin/env python3
"""回归：访问日志 updated_at + 全列排序 + 未登录 10 天裁剪 + 下拉即筛。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needles: list[str], label: str) -> list[str]:
    text = path.read_text(encoding="utf-8")
    missing = [n for n in needles if n not in text]
    if missing:
        return [f"{label}: missing {m!r} in {path.relative_to(ROOT)}" for m in missing]
    return []


def main() -> int:
    errors: list[str] = []

    errors += must_contain(
        ROOT / "src/lib/analytics-db.ts",
        [
            "VISIT_LOG_SORT_FIELDS",
            "parseVisitLogSortField",
            "copyIpGeoOntoVisitLogs",
            "updated_at",
            "geo_area",
            "ensureVisitLogsSchema",
        ],
        "analytics-db",
    )
    errors += must_contain(
        ROOT / "src/components/AdminDashboardPage.tsx",
        [
            "AdminVisitSortTh",
            "updatedAt",
            "handleVisitSort",
            "handleVisitUsernameFilterChange",
            "AdminVisitSortTh",
        ],
        "AdminDashboardPage",
    )
    errors += must_contain(
        ROOT / "src/components/admin-dashboard/AdminVisitSortTh.tsx",
        ["AdminVisitSortTh", "nextVisitSortState"],
        "AdminVisitSortTh",
    )
    errors += must_contain(
        ROOT / "src/app/api/analytics/visits/route.ts",
        ["parseVisitLogSortField"],
        "visits API",
    )
    errors += must_contain(
        ROOT / "src/lib/etr-auth-db/ip_geo_backfill.ts",
        ["copyIpGeoOntoVisitLogs", "visit_rows_updated"],
        "ip_geo_backfill",
    )
    errors += must_contain(
        ROOT / "scripts/login-ip-geo-backfill-remote.py",
        [
            "UPDATE visit_logs",
            "updated_at",
            "copy_geo_onto_history_and_visits",
            "sync_cache_onto_visit_logs",
            "--sync-visits",
            "purge_unregistered_visit_logs",
            "--purge-unregistered",
        ],
        "remote backfill",
    )
    errors += must_contain(
        ROOT / "src/lib/analytics-db.ts",
        [
            "purgeUnregisteredVisitLogsOlderThan",
            "VISIT_LOG_UNREGISTERED_RETENTION_DAYS",
        ],
        "analytics-db purge",
    )
    # 工具栏禁止：搜索按钮 / 排序下拉 / 刷新（排序靠表头）
    page = (ROOT / "src/components/AdminDashboardPage.tsx").read_text(encoding="utf-8")
    for banned, why in (
        ("handleVisitUsernameSearch", "select must filter immediately"),
        ("adm.visits.filterSearch", "no Search button"),
        ("admin-visits-sort", "no toolbar sort; use table headers"),
        ("adm.visits.sortLabel", "no toolbar sort label"),
        ("adm.visits.refresh", "no Refresh button in visits toolbar"),
        ("handleVisitSortFieldChange", "no toolbar sort field select"),
        ("handleVisitSortOrderToggle", "no toolbar sort order toggle"),
    ):
        if banned in page:
            errors.append(f"AdminDashboardPage: remove {banned} ({why})")

    errors += must_contain(
        ROOT / "schema.sql",
        ["geo_area", "updated_at"],
        "schema visit_logs",
    )

    if errors:
        print("FAIL: admin dashboard visit logs checks")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("OK: admin dashboard visit logs (updated_at + sort + unreg retention + instant filter)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
