#!/usr/bin/env python3
"""Regression: admin users login IP history must stay wired end-to-end."""

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
            ROOT / "src/app/api/admin/users/login-history/route.ts",
            ["listUserLoginHistory", "requireAdmin"],
        ),
        (
            ROOT / "src/components/admin-users-page/admin-users-page-helpers.tsx",
            ["查看历史登录IP", "onViewHistory", "admin-user-ip-history"],
        ),
        (
            ROOT / "src/components/AdminUserLoginHistoryModal.tsx",
            ["/api/admin/users/login-history", "历史登录 IP"],
        ),
        (
            ROOT / "schema.sql",
            ["etr_user_login_history"],
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
    if failed:
        return 1
    print("check_admin_users_login_history: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
