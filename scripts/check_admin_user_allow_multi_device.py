#!/usr/bin/env python3
"""Regression: admin users「不限制登录设备」must wire DB + session + UI."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    "schema": ROOT / "src/lib/etr-auth-db/schema.ts",
    "users": ROOT / "src/lib/etr-auth-db/users.ts",
    "session": ROOT / "src/lib/etr-auth-db/session.ts",
    "route": ROOT / "src/app/api/admin/users/route.ts",
    "helpers": ROOT / "src/components/admin-users-page/admin-users-page-helpers.tsx",
    "actions": ROOT / "src/components/admin-users-page/useAdminUsersPageActions.ts",
    "list": ROOT / "src/components/admin-users-page/AdminUsersList.tsx",
    "page": ROOT / "src/components/AdminUsersPage.tsx",
    "rule": ROOT / ".cursor/rules/admin-user-allow-multi-device.mdc",
    "index": ROOT / "docs/feature-index.md",
}


def main() -> int:
    errors: list[str] = []
    texts: dict[str, str] = {}
    for key, path in FILES.items():
        if not path.is_file():
            errors.append(f"missing {key}: {path}")
            continue
        texts[key] = path.read_text(encoding="utf-8")

    if errors:
        print("check_admin_user_allow_multi_device: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    if 'addColumnIfMissing("allow_multi_device"' not in texts["schema"]:
        errors.append("schema must add allow_multi_device column default 0")
    if "setUserAllowMultiDevice" not in texts["users"]:
        errors.append("users.ts missing setUserAllowMultiDevice")
    if "isSingleDeviceRestrictedUser" not in texts["session"]:
        errors.append("session.ts must use isSingleDeviceRestrictedUser")
    if "isSingleDeviceRestrictedRole" in texts["session"]:
        errors.append("session.ts must not keep role-only isSingleDeviceRestrictedRole")
    if "allow_multi_device" not in texts["session"]:
        errors.append("session lookup/create must read allow_multi_device")
    if "setUserAllowMultiDevice" not in texts["route"]:
        errors.append("PATCH /api/admin/users must call setUserAllowMultiDevice")
    if "allow_multi_device" not in texts["route"]:
        errors.append("API serialize/PATCH body must include allow_multi_device")
    if "不限制登录设备" not in texts["helpers"]:
        errors.append("AdminUserActions must show 不限制登录设备")
    if "onToggleAllowMultiDevice" not in texts["helpers"]:
        errors.append("helpers must expose onToggleAllowMultiDevice")
    if "toggleAllowMultiDevice" not in texts["actions"]:
        errors.append("useAdminUsersPageActions missing toggleAllowMultiDevice")
    if "onToggleAllowMultiDevice={toggleAllowMultiDevice}" not in texts["page"]:
        errors.append("AdminUsersPage must wire toggleAllowMultiDevice")
    if "onToggleAllowMultiDevice={onToggleAllowMultiDevice}" not in texts["list"]:
        errors.append("AdminUsersList must pass onToggleAllowMultiDevice")
    if "不限制登录设备" not in texts["index"]:
        errors.append("feature-index.md must document 不限制登录设备")
    if "allow_multi_device" not in texts["rule"]:
        errors.append("rule must mention allow_multi_device")

    if errors:
        print("check_admin_user_allow_multi_device: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("check_admin_user_allow_multi_device: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
