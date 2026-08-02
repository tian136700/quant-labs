#!/usr/bin/env python3
"""回归：1102 诊断看板（路由 / 面板 / API / 热路径观察 / 复制报告）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    for rel in (
        "src/app/admin/worker-1102/page.tsx",
        "src/app/zh/admin/worker-1102/page.tsx",
    ):
        page = read(rel)
        if "AdminWorker1102Page" not in page:
            errors.append(f"{rel} 须渲染 AdminWorker1102Page")

    shell = read("src/components/AdminWorker1102Page.tsx")
    if "AdminWorker1102Panel" not in shell:
        errors.append("AdminWorker1102Page 须挂载 AdminWorker1102Panel")
    if 'admin:dashboard' not in shell and '"admin:dashboard"' not in shell:
        errors.append("AdminWorker1102Page 须 admin:dashboard 鉴权")

    panel = read("src/components/admin-dashboard/AdminWorker1102Panel.tsx")
    for needle in (
        "formatWorker1102DiagnosticReport",
        "copyTextToClipboard",
        "CopyToast",
        "/api/analytics/worker-1102",
        "copyReport",
        "guideHeading",
        "guideTriage",
        "riskNotesHeading",
        "failureLane",
        "fillContention",
        "admin-1102-text-table",
        "EmptyTableRow",
    ):
        if needle not in panel:
            errors.append(f"AdminWorker1102Panel 须含 {needle}")

    api = read("src/app/api/analytics/worker-1102/route.ts")
    if "getWorker1102DiagnosticSummary" not in api:
        errors.append("GET /api/analytics/worker-1102 须调 getWorker1102DiagnosticSummary")
    if "admin:dashboard" not in api:
        errors.append("worker-1102 API 须 requirePermission admin:dashboard")

    db = read("src/lib/worker-1102-db.ts")
    for needle in (
        "worker_heavy_signals",
        "getWorker1102DiagnosticSummary",
        "incrementWorkerHeavySignal",
        "heaviest_notes",
        "today_shared_sum_list_bytes",
        "fill_contention_hits",
        "failure_lane",
        "open_next_static_shell_cache",
        "notes_not_primary_cause",
        "HEAVIEST_NOTES_MIN_BYTES",
    ):
        if needle not in db:
            errors.append(f"worker-1102-db.ts 须含 {needle}")

    triage = read("src/lib/worker-1102-triage.ts")
    for needle in (
        "classifyWorker1102FailureLane",
        "prioritizeWorker1102ClientSamples",
        "isWorker1102FillRoute",
        "isWorker1102RelatedTrafficRoute",
    ):
        if needle not in triage:
            errors.append(f"worker-1102-triage.ts 须含 {needle}")

    open_next = read("open-next.config.ts")
    if "staticAssetsIncrementalCache" not in open_next:
        errors.append("open-next.config.ts 须 staticAssetsIncrementalCache（study HTML 1102）")
    if "enableCacheInterception: true" not in open_next:
        errors.append("open-next.config.ts 须 enableCacheInterception: true")

    observe = read("src/lib/worker-1102-observe.ts")
    if "jsonResponseObserving1102" not in observe:
        errors.append("worker-1102-observe 须导出 jsonResponseObserving1102")

    for rel in (
        "src/app/api/jp-vocab/shared/route.ts",
        "src/app/api/en-vocab/shared/route.ts",
        "src/app/api/jp-vocab/class-notes/route.ts",
        "src/app/api/en-vocab/class-notes/route.ts",
    ):
        text = read(rel)
        if "jsonResponseObserving1102" not in text:
            errors.append(f"{rel} GET 须 jsonResponseObserving1102（1102 重信号）")

    schema = read("schema.sql")
    if "worker_heavy_signals" not in schema:
        errors.append("schema.sql 缺少 worker_heavy_signals")
    if "worker_1102_client_events" not in schema:
        errors.append("schema.sql 缺少 worker_1102_client_events")

    if "Worker1102ClientGuard" not in read("src/components/Providers.tsx"):
        errors.append("Providers 须挂 Worker1102ClientGuard")

    client_api = ROOT / "src/app/api/analytics/worker-1102/client-report/route.ts"
    if not client_api.exists():
        errors.append("缺少 POST /api/analytics/worker-1102/client-report")
    else:
        text = client_api.read_text(encoding="utf-8")
        if "recordWorker1102ClientEvent" not in text:
            errors.append("client-report 须写 recordWorker1102ClientEvent")

    panel = read("src/components/admin-dashboard/AdminWorker1102Panel.tsx")
    if "client_event_samples" not in panel and "clientSamplesHeading" not in panel:
        errors.append("AdminWorker1102Panel 须展示客户端现场样本")

    for rel in (
        "src/components/JpVocabStudyPage.tsx",
        "src/components/EnVocabStudyPage.tsx",
    ):
        if "reportWorker1102SharedFail" not in read(rel):
            errors.append(f"{rel} 须上报 shared_fail")

    path_lib = read("src/lib/locale-path.ts")
    if "adminWorker1102Path" not in path_lib or "isAdminWorker1102Path" not in path_lib:
        errors.append("locale-path 须含 adminWorker1102Path / isAdminWorker1102Path")

    nav = read("src/lib/nav-href.ts")
    if '"adminWorker1102"' not in nav:
        errors.append("nav-href NavTarget 须含 adminWorker1102")

    zh = read("src/i18n/messages/zh.ts")
    if "adminWorker1102:" not in zh or "1102 诊断看板" not in zh:
        errors.append("zh i18n 缺少 adminWorker1102")
    if "复制诊断报告" not in zh:
        errors.append("zh i18n 1102 面板须含复制诊断报告")
    if "失败车道" not in zh or "fill-* 争用合计" not in zh:
        errors.append("zh i18n 1102 面板须含失败车道 / fill 争用")

    dash = read("src/components/AdminDashboardPage.tsx")
    if "adminWorker1102Path" not in dash:
        errors.append("AdminDashboardPage 须链接到 adminWorker1102Path")

    if "worker_heavy_signals" not in read("schema.sql"):
        errors.append("schema 重复检查失败")

    if errors:
        print("check_worker_1102_board FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK: worker 1102 diagnose board")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
