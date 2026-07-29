#!/usr/bin/env python3
"""Regression: /admin/users 操作列须有「更换密码」一键换密（确认 + API + 复制）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> int:
    print(f"[check_admin_users_reset_password] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    page = (ROOT / "src/components/AdminUsersPage.tsx").read_text(encoding="utf-8")
    helpers = (
        ROOT / "src/components/admin-users-page/admin-users-page-helpers.tsx"
    ).read_text(encoding="utf-8")
    actions = (
        ROOT / "src/components/admin-users-page/useAdminUsersPageActions.ts"
    ).read_text(encoding="utf-8")
    list_tsx = (
        ROOT / "src/components/admin-users-page/AdminUsersList.tsx"
    ).read_text(encoding="utf-8")
    api = (
        ROOT / "src/app/api/admin/users/reset-password/route.ts"
    ).read_text(encoding="utf-8")
    db = (ROOT / "src/lib/etr-auth-db/users.ts").read_text(encoding="utf-8")

    if "更换密码" not in helpers:
        return fail("AdminUserActions must show 更换密码 button")

    if "onResetPassword" not in helpers:
        return fail("AdminUserActions must take onResetPassword")

    if "onResetPassword={resetUserPassword}" not in page:
        return fail("AdminUsersPage must wire resetUserPassword")

    if "onResetPassword={onResetPassword}" not in list_tsx:
        return fail("AdminUsersList must pass onResetPassword to AdminUserActions")

    if "resettingId" not in page or "setResettingId" not in page:
        return fail("AdminUsersPage must track resettingId separately from copyingId")

    if "const resetUserPassword" not in actions:
        return fail("useAdminUsersPageActions must export resetUserPassword")

    if "window.confirm" not in actions or "确定更换" not in actions:
        return fail("resetUserPassword must confirm before resetting")

    if "/api/admin/users/reset-password" not in actions:
        return fail("reset must call /api/admin/users/reset-password")

    if "resetUserPasswordByAdmin" not in api:
        return fail("reset-password route must call resetUserPasswordByAdmin")

    if "cannot_reset_bootstrap" not in db:
        return fail("resetUserPasswordByAdmin must block bootstrap accounts")

    if "revokeUserSessions" not in db:
        return fail("password reset must revoke sessions")

    if "generateMemorableTeacherPassword" not in db:
        return fail("password reset must use memorable teacher password")

    print("[check_admin_users_reset_password] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
