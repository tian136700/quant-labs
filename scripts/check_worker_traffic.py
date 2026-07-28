#!/usr/bin/env python3
"""回归：Worker 日流量统计（middleware + /admin 看板）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    middleware = read("src/middleware.ts")
    if "maybeRecordWorkerTraffic" not in middleware:
        errors.append("middleware.ts 须调用 maybeRecordWorkerTraffic")

    schema = read("schema.sql")
    if "worker_daily_hits" not in schema:
        errors.append("schema.sql 缺少 worker_daily_hits 表")

    admin = read("src/components/AdminDashboardPage.tsx")
    if "AdminWorkerTrafficPanel" not in admin:
        errors.append("AdminDashboardPage 须挂载 AdminWorkerTrafficPanel")

    api = read("src/app/api/analytics/traffic/route.ts")
    if "getWorkerTrafficDailySummary" not in api:
        errors.append("缺少 GET /api/analytics/traffic")

    zh = read("src/i18n/messages/zh.ts")
    if "traffic:" not in zh or "Worker 流量看板" not in zh:
        errors.append("zh i18n 缺少 adminDashboard.traffic")

    path_lib = read("src/lib/worker-traffic-path.ts")
    if "shouldCountWorkerTraffic" not in path_lib:
        errors.append("缺少 worker-traffic-path.ts")

    if errors:
        for err in errors:
            print(f"FAIL: {err}", file=sys.stderr)
        return 1

    print("OK: worker traffic stats wired")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
