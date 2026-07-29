#!/usr/bin/env python3
"""回归：Worker 日流量统计（middleware + /admin/worker-traffic 看板 + 1027 诊断字段）。"""

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
    if "worker_hourly_hits" not in schema:
        errors.append("schema.sql 缺少 worker_hourly_hits 表（分时折线）")

    page = read("src/components/AdminWorkerTrafficPage.tsx")
    if "AdminWorkerTrafficPanel" not in page:
        errors.append("AdminWorkerTrafficPage 须挂载 AdminWorkerTrafficPanel")

    dash = read("src/components/AdminDashboardPage.tsx")
    if "AdminWorkerTrafficPanel" in dash:
        errors.append(
            "AdminDashboardPage 不应再挂载 AdminWorkerTrafficPanel（已拆到流量检测页）"
        )
    if "adminWorkerTrafficPath" not in dash:
        errors.append("AdminDashboardPage 须链接到 adminWorkerTrafficPath")

    for rel in (
        "src/app/admin/worker-traffic/page.tsx",
        "src/app/zh/admin/worker-traffic/page.tsx",
    ):
        route = read(rel)
        if "AdminWorkerTrafficPage" not in route:
            errors.append(f"{rel} 须渲染 AdminWorkerTrafficPage")

    api = read("src/app/api/analytics/traffic/route.ts")
    if "getWorkerTrafficDailySummary" not in api:
        errors.append("缺少 GET /api/analytics/traffic")

    zh = read("src/i18n/messages/zh.ts")
    if "traffic:" not in zh or "Worker 流量看板" not in zh:
        errors.append("zh i18n 缺少 adminDashboard.traffic")
    if "复制诊断报告" not in zh or "用户 × 接口" not in zh:
        errors.append("zh i18n 须含复制诊断报告 / 用户 × 接口")
    if "adminWorkerTraffic:" not in zh or "流量检测看板" not in zh:
        errors.append("zh i18n 缺少 adminWorkerTraffic 页面文案")

    path_lib = read("src/lib/worker-traffic-path.ts")
    if "shouldCountWorkerTraffic" not in path_lib:
        errors.append("缺少 worker-traffic-path.ts")

    locale = read("src/lib/locale-path.ts")
    if "adminWorkerTrafficPath" not in locale or "isAdminWorkerTrafficPath" not in locale:
        errors.append("locale-path 须含 adminWorkerTrafficPath / isAdminWorkerTrafficPath")

    nav = read("src/lib/nav-href.ts")
    if '"adminWorkerTraffic"' not in nav:
        errors.append("nav-href NavTarget 须含 adminWorkerTraffic")

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
        "AdminWorkerTrafficCharts",
        "hourly",
        "daily_trend",
    ):
        if needle not in panel:
            errors.append(f"AdminWorkerTrafficPanel 须含 {needle}")

    charts = read("src/components/admin-dashboard/AdminWorkerTrafficCharts.tsx")
    for needle in ("LineChart", "recharts", "ReferenceLine", "08:00"):
        if needle not in charts:
            errors.append(f"AdminWorkerTrafficCharts 须含 {needle}")
    if 'next/dynamic' not in panel and "dynamic(" not in panel:
        errors.append("AdminWorkerTrafficPanel 须 dynamic 懒加载 Charts（recharts 体积）")

    css = read("src/app/globals/globals-store-tool.css")
    if "admin-traffic-charts" not in css:
        errors.append("globals-store-tool.css 须含 admin-traffic-charts 样式")

    report = read("src/lib/worker-traffic-report.ts")
    if "formatWorkerTrafficDiagnosticReport" not in report:
        errors.append("缺少 worker-traffic-report.ts")

    for needle in ("worker_hourly_hits", "getWorkerTrafficHourlySeries", "daily_trend", "getWorkerTrafficRouteIps", "avg_hits_per_sec"):
        if needle not in db:
            errors.append(f"worker-traffic-db.ts 须含 {needle}")

    rate_limit = read("src/lib/worker-api-rate-limit.ts")
    if "JP_VOCAB_FILL_MEANING_MIN_INTERVAL_MS" not in rate_limit:
        errors.append("缺少 fill-meaning Worker 硬限流常量")
    if "5000" not in rate_limit and "5_000" not in rate_limit:
        errors.append("fill-meaning 硬限流须为 5 秒")

    fill_route = read("src/app/api/jp-vocab/fill-meaning/route.ts")
    if "enforceVocabFillRouteRateLimit" not in fill_route and "enforceWorkerApiMinInterval" not in fill_route:
        errors.append("fill-meaning route 须 enforceVocabFillRouteRateLimit 并返回 429")
    if "429" not in fill_route and "enforceVocabFillRouteRateLimit" not in fill_route:
        # helper returns 429 Response
        pass

    for rel in (
        "src/app/api/en-vocab/fill-meaning/route.ts",
        "src/app/api/en-vocab/fill-reading/route.ts",
        "src/app/api/en-vocab/fill-usage/route.ts",
        "src/app/api/en-vocab/fill-example-sentences/route.ts",
        "src/app/api/jp-vocab/fill-reading/route.ts",
        "src/app/api/jp-vocab/fill-usage/route.ts",
        "src/app/api/jp-vocab/fill-pos/route.ts",
        "src/app/api/jp-vocab/fill-example-sentences/route.ts",
    ):
        route = read(rel)
        if "enforceVocabFillRouteRateLimit" not in route:
            errors.append(f"{rel} 须 enforceVocabFillRouteRateLimit（5s 硬限）")

    fill_script = read("scripts/jp-vocab-fill-meaning-api.py")
    if "post_worker_fill_api" not in fill_script:
        errors.append("释义脚本须走 worker_fill_http.post_worker_fill_api（5s）")

    en_common = read("scripts/lib/en_vocab_fill_common.py")
    if "post_worker_fill_api" not in en_common:
        errors.append("en_vocab_fill_common 须走 post_worker_fill_api（5s）")

    fill_http = read("scripts/lib/worker_fill_http.py")
    if "API_MIN_INTERVAL_SEC = 5" not in fill_http:
        errors.append("worker_fill_http 须 API_MIN_INTERVAL_SEC=5")

    for rel in (
        "scripts/jp-vocab-fill-reading-api.py",
        "scripts/jp-vocab-fill-example-sentences-api.py",
        "scripts/jp-vocab-fill-example-sentences-ai.py",
        "scripts/jp-vocab-fill-grammar-usage-examples-api.py",
    ):
        script = read(rel)
        if "post_worker_fill_api" not in script:
            errors.append(f"{rel} 须走 post_worker_fill_api（定时打线上须 5s）")

    if "VOCAB_FILL_API_MIN_INTERVAL_MS" not in rate_limit:
        errors.append("worker-api-rate-limit 须含 VOCAB_FILL_API_MIN_INTERVAL_MS")
    if "/api/en-vocab/fill-meaning" not in rate_limit:
        errors.append("VOCAB_FILL_RATE_LIMITED_ROUTES 须含英语 fill-meaning")

    if "hourlyHeading" not in zh or "分时折线" not in zh:
        errors.append("zh i18n 须含分时折线文案")
    if "avgPerSec" not in zh or "routeIpsHeading" not in zh:
        errors.append("zh i18n 须含平均每秒 / 接口 IP 文案")

    if "AdminWorkerTrafficRouteIpModal" not in panel:
        errors.append("AdminWorkerTrafficPanel 须挂载 RouteIpModal")

    if errors:
        for err in errors:
            print(f"FAIL: {err}", file=sys.stderr)
        return 1

    print("OK: worker traffic stats + 1027 diagnose on /admin/worker-traffic")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
