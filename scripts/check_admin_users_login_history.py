#!/usr/bin/env python3
"""Regression: admin users login IP history + ip9 geo throttle must stay wired."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [n for n in needles if n not in text]


def must_not_contain(path: Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [n for n in needles if n in text]


def main() -> int:
    checks: list[tuple[Path, list[str]]] = [
        (
            ROOT / "src/lib/etr-auth-db/login_history.ts",
            [
                "etr_user_login_history",
                "recordUserLoginHistory",
                "listUserLoginHistory",
            ],
        ),
        (
            ROOT / "src/lib/etr-auth-db/session.ts",
            ["recordUserLoginHistory"],
        ),
        (
            ROOT / "src/lib/ip9-geo.ts",
            [
                "ip9.com.cn/get",
                "IP9_MIN_INTERVAL_MS",
                "outboundChain",
                "formatIp9RegionLabel",
            ],
        ),
        (
            ROOT / "src/lib/etr-auth-db/ip_geo_cache.ts",
            [
                "etr_ip_geo_cache",
                "resolveIpGeoCached",
                "getCachedIpGeoMap",
                "area",
            ],
        ),
        (
            ROOT / "src/app/api/admin/users/login-history/route.ts",
            ["listUserLoginHistory", "requireAdmin", "getCachedIpGeoMap", "geo_pending"],
        ),
        (
            ROOT / "src/app/api/admin/users/ip-geo/route.ts",
            ["resolveIpGeoCached", "requireAdmin"],
        ),
        (
            ROOT / "src/app/api/admin/users/ip-geo/backfill/route.ts",
            [
                "stepLoginIpGeoBackfill",
                "requeueLoginIpGeoBackfill",
                "verifyUploadAuth",
            ],
        ),
        (
            ROOT / "src/lib/etr-auth-db/ip_geo_backfill.ts",
            [
                "listDistinctLoginIps",
                "stepLoginIpGeoBackfill",
                "requeueLoginIpGeoBackfill",
                "pending_ips",
            ],
        ),
        (
            ROOT / "scripts/login-ip-geo-backfill-api.py",
            ["ip-geo/backfill", "--mode", "requeue"],
        ),
        (
            ROOT / "scripts/maintenance_center/cron_tasks/registry.py",
            ["login-ip-geo-backfill", "StartInterval=30"],
        ),
        (
            ROOT / "scripts/login-ip-geo-backfill-remote.py",
            ["etr_ip_geo_cache", "ip9.com.cn", "--interval"],
        ),
        (
            ROOT / "scripts/login-ip-geo-backfill.sh",
            ["LOGIN_IP_GEO_BACKFILL_VIA", "login-ip-geo-backfill-remote.py"],
        ),
        (
            ROOT / "src/components/admin-users-page/admin-users-page-helpers.tsx",
            ["查看历史登录IP", "onViewHistory", "admin-user-ip-history"],
        ),
        (
            ROOT / "src/components/AdminUserLoginHistoryModal.tsx",
            [
                "/api/admin/users/login-history",
                "/api/admin/users/ip-geo",
                "历史登录 IP",
                "GEO_ENRICH_GAP_MS",
                "归属地（省/市/区县）",
            ],
        ),
        (
            ROOT / "schema.sql",
            ["etr_user_login_history", "etr_ip_geo_cache"],
        ),
    ]
    failed = False
    for path, needles in checks:
        if not path.is_file():
            print(f"MISSING {path.relative_to(ROOT)}", file=sys.stderr)
            failed = True
            continue
        missing = must_contain(path, needles)
        if missing:
            failed = True
            rel = path.relative_to(ROOT)
            print(f"FAIL {rel}: missing {missing}", file=sys.stderr)

    # 列表接口禁止直接打 ip9
    history_route = ROOT / "src/app/api/admin/users/login-history/route.ts"
    bad = must_not_contain(history_route, ["fetchIp9Geo", "ip9.com.cn"])
    if bad:
        failed = True
        print(
            f"FAIL {history_route.relative_to(ROOT)}: must not call ip9 directly ({bad})",
            file=sys.stderr,
        )

    modal = ROOT / "src/components/AdminUserLoginHistoryModal.tsx"
    if "Promise.all" in modal.read_text(encoding="utf-8"):
        failed = True
        print(
            f"FAIL {modal.relative_to(ROOT)}: must not Promise.all geo lookups",
            file=sys.stderr,
        )

    if failed:
        return 1
    print("check_admin_users_login_history: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
