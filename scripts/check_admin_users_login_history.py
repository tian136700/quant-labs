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
                "enqueueLoginIpGeoLookup",
                "copyIpGeoOntoLoginHistory",
                "geo_region_label",
                "etr_ip_geo_queue",
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
                "IP9_MIN_INTERVAL_MS = 30_000",
                "outboundChain",
                "formatIp9RegionLabel",
            ],
        ),
        (
            ROOT / "src/lib/etr-auth-db/ip_geo_backfill.ts",
            [
                "stepLoginIpGeoBackfill",
                "copyIpGeoOntoLoginHistory",
                "pending_ips",
            ],
        ),
        (
            ROOT / "src/components/AdminUserLoginHistoryModal.tsx",
            [
                "/api/admin/users/login-history",
                "历史登录 IP",
                "SOFT_REFRESH_MS",
                "归属地（省/市/区县）",
            ],
        ),
        (
            ROOT / "src/app/api/admin/users/ip-geo/route.ts",
            ["getCachedIpGeo", "enqueueLoginIpGeoLookup", "pending"],
        ),
        (
            ROOT / "src/app/api/admin/users/login-history/route.ts",
            ["listUserLoginHistory", "requireAdmin", "copyIpGeoOntoLoginHistory"],
        ),
        (
            ROOT / "src/app/api/admin/users/ip-geo/backfill/route.ts",
            ["stepLoginIpGeoBackfill", "verifyUploadAuth"],
        ),
        (
            ROOT / "scripts/login-ip-geo-backfill.sh",
            ["LOGIN_IP_GEO_BACKFILL_VIA", "login-ip-geo-backfill-remote.py"],
        ),
        (
            ROOT / "scripts/maintenance_center/cron_tasks/registry.py",
            ["login-ip-geo-backfill", "StartInterval=30"],
        ),
        (
            ROOT / "schema.sql",
            ["etr_user_login_history", "etr_ip_geo_cache", "etr_ip_geo_queue"],
        ),
        (
            ROOT / "src/components/admin-users-page/admin-users-page-helpers.tsx",
            ["查看历史登录IP", "onViewHistory", "admin-user-ip-history"],
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

    history_route = ROOT / "src/app/api/admin/users/login-history/route.ts"
    bad = must_not_contain(history_route, ["fetchIp9Geo", "ip9.com.cn"])
    if bad:
        failed = True
        print(
            f"FAIL {history_route.relative_to(ROOT)}: must not call ip9 directly ({bad})",
            file=sys.stderr,
        )

    ip_geo_route = ROOT / "src/app/api/admin/users/ip-geo/route.ts"
    if "resolveIpGeoCached" in ip_geo_route.read_text(encoding="utf-8"):
        failed = True
        print(
            f"FAIL {ip_geo_route.relative_to(ROOT)}: must be cache-only (no resolveIpGeoCached)",
            file=sys.stderr,
        )

    modal = ROOT / "src/components/AdminUserLoginHistoryModal.tsx"
    modal_text = modal.read_text(encoding="utf-8")
    if "Promise.all" in modal_text or "/api/admin/users/ip-geo?" in modal_text:
        failed = True
        print(
            f"FAIL {modal.relative_to(ROOT)}: must not call ip-geo from modal",
            file=sys.stderr,
        )

    if failed:
        return 1
    print("check_admin_users_login_history: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
