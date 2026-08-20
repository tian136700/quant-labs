#!/usr/bin/env python3
"""Regression: teacher quiz must refresh last_login_* (activity IP), throttled."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [n for n in needles if n not in text]


def main() -> int:
    checks: list[tuple[Path, list[str]]] = [
        (
            ROOT / "src/lib/etr-auth-db/activity_ip.ts",
            [
                "USER_ACTIVITY_IP_THROTTLE_MS",
                "touchUserActivityIp",
                "touchAuthUserActivityIpFromRequest",
                "recordUserLoginHistory",
                "last_login_ip",
            ],
        ),
        (
            ROOT / "src/lib/etr-auth-db/index.ts",
            ["touchAuthUserActivityIpFromRequest", "activity_ip"],
        ),
        (
            ROOT / "src/app/api/jp-vocab/teacher-quiz-live/route.ts",
            ["touchAuthUserActivityIpFromRequest"],
        ),
        (
            ROOT / "src/app/api/en-vocab/teacher-quiz-live/route.ts",
            ["touchAuthUserActivityIpFromRequest"],
        ),
        (
            ROOT / "src/app/api/ko-pron/live/route.ts",
            ["touchAuthUserActivityIpFromRequest"],
        ),
        (
            ROOT / "src/app/api/jp-vocab/route.ts",
            ["touchAuthUserActivityIpFromRequest"],
        ),
        (
            ROOT / "src/app/api/en-vocab/route.ts",
            ["touchAuthUserActivityIpFromRequest"],
        ),
        (
            ROOT / "src/app/api/ko-pron/route.ts",
            ["touchAuthUserActivityIpFromRequest"],
        ),
        (
            ROOT / "src/components/admin-users-page/AdminUsersList.tsx",
            ["最近活跃", "最近 IP"],
        ),
        (
            ROOT / ".cursor/rules/admin-users-quiz-activity-ip.mdc",
            ["touchAuthUserActivityIpFromRequest", "USER_ACTIVITY_IP_THROTTLE"],
        ),
    ]

    failed = False
    for path, needles in checks:
        if not path.is_file():
            print(f"MISSING {path.relative_to(ROOT)}")
            failed = True
            continue
        missing = must_contain(path, needles)
        if missing:
            failed = True
            print(f"FAIL {path.relative_to(ROOT)} missing: {missing}")
        else:
            print(f"ok   {path.relative_to(ROOT)}")

    # login-history check still expects older UI copy? allow both
    hist = ROOT / "scripts/check_admin_users_login_history.py"
    if hist.is_file() and "历史登录 IP" in hist.read_text(encoding="utf-8"):
        modal = ROOT / "src/components/AdminUserLoginHistoryModal.tsx"
        if modal.is_file() and "历史登录 IP" not in modal.read_text(encoding="utf-8"):
            print(
                "WARN AdminUserLoginHistoryModal title may have changed; "
                "update check_admin_users_login_history.py if needed"
            )

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
