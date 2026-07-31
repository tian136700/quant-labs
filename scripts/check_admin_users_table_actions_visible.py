#!/usr/bin/env python3
"""Guard: /admin/users desktop table keeps action buttons fully visible."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLES = ROOT / "src/components/admin-users-page/AdminUsersPageStyles.tsx"
HELPERS = ROOT / "src/components/admin-users-page/admin-users-page-helpers.tsx"
LIST = ROOT / "src/components/admin-users-page/AdminUsersList.tsx"
MOBILE = ROOT / "src/app/mobile/mobile-jp-notes-admin.css"


def main() -> int:
    styles = STYLES.read_text(encoding="utf-8")
    helpers = HELPERS.read_text(encoding="utf-8")
    listing = LIST.read_text(encoding="utf-8")
    mobile = MOBILE.read_text(encoding="utf-8")
    errors: list[str] = []

    if "overflow-x: hidden" not in styles:
        errors.append("AdminUsersPageStyles: users table wrap must overflow-x:hidden")
    if "admin-rbac-table.admin-users-table" not in styles:
        errors.append("AdminUsersPageStyles: must override .admin-rbac-table.admin-users-table min-width")
    if not re.search(r"\.admin-rbac-table\.admin-users-table\s*\{[^}]*min-width:\s*0", styles, re.S):
        errors.append("AdminUsersPageStyles: .admin-rbac-table.admin-users-table must set min-width:0")
    if "repeat(2, minmax(0, 1fr))" not in styles:
        errors.append("AdminUsersPageStyles: .admin-user-actions must be 2-column grid")
    if "repeat(3, minmax(0, 1fr))" in styles:
        errors.append("AdminUsersPageStyles: do not use 3-column action grid (clips buttons)")
    if "AdminUserDateTimeStacked" not in helpers:
        errors.append("helpers: missing AdminUserDateTimeStacked")
    if "AdminUserDateTimeStacked" not in listing:
        errors.append("AdminUsersList: created/login must use AdminUserDateTimeStacked")
    if "admin-user-dt-stacked" not in styles:
        errors.append("AdminUsersPageStyles: missing :global(.admin-user-dt-stacked)")

    # 手机卡：禁止再写成三列（曾导致按键重叠/裁字）
    if "admin-user-card .admin-user-actions" not in mobile:
        errors.append("mobile-jp-notes-admin.css: missing .admin-user-card .admin-user-actions")
    if re.search(
        r"\.admin-user-card\s+\.admin-user-actions\s*\{[^}]*repeat\(\s*3\s*,",
        mobile,
        re.S,
    ):
        errors.append(
            "mobile-jp-notes-admin.css: .admin-user-card .admin-user-actions must not be 3-column"
        )
    if not re.search(
        r"\.admin-user-card\s+\.admin-user-actions\s*\{[^}]*repeat\(\s*2\s*,\s*minmax\(0,\s*1fr\)\)",
        mobile,
        re.S,
    ):
        errors.append(
            "mobile-jp-notes-admin.css: .admin-user-card .admin-user-actions must be 2-column grid"
        )

    if errors:
        print("check_admin_users_table_actions_visible FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_admin_users_table_actions_visible: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
