#!/usr/bin/env python3
"""回归：访问日志 updated_at + 全列排序 + 归属地回填刷新更新时间。"""

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
            "admin-visits-sort",
            "VISIT_LOG_SORT_FIELDS",
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
        ["UPDATE visit_logs", "updated_at"],
        "remote backfill",
    )
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

    print("OK: admin dashboard visit logs (updated_at + sort + geo copy)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
