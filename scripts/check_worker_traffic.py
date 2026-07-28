#!/usr/bin/env python3
"""回归：Worker 日流量统计（middleware + /admin 看板 + 1027 诊断字段）。"""

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
    if "复制诊断报告" not in zh or "用户 × 接口" not in zh:
        errors.append("zh i18n 须含复制诊断报告 / 用户 × 接口")

    path_lib = read("src/lib/worker-traffic-path.ts")
    if "shouldCountWorkerTraffic" not in path_lib:
        errors.append("缺少 worker-traffic-path.ts")

    db = read("src/lib/worker-traffic-db.ts")
    for needle in ("anonymous_hits", "top_pairs", "WorkerTrafficPairRow"):
        if needle not in db:
            errors.append(f"worker-traffic-db.ts 须含 {needle}")

    panel = read("src/components/admin-dashboard/AdminWorkerTrafficPanel.tsx")
    for needle in (
        "formatWorkerTrafficDiagnosticReport",
        "copyTextToClipboard",
        "CopyToast",
        "top_pairs",
        "anonymous_hits",
    ):
        if needle not in panel:
            errors.append(f"AdminWorkerTrafficPanel 须含 {needle}")

    report = read("src/lib/worker-traffic-report.ts")
    if "formatWorkerTrafficDiagnosticReport" not in report:
        errors.append("缺少 worker-traffic-report.ts")

    if errors:
        for err in errors:
            print(f"FAIL: {err}", file=sys.stderr)
        return 1

    print("OK: worker traffic stats + 1027 diagnose wired")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
