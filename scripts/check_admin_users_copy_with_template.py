#!/usr/bin/env python3
"""Regression: /admin/users 带模板复制须先选模板，再拼用户名/密码/抽查链接。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> int:
    print(f"[check_admin_users_copy_with_template] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    page = (ROOT / "src/components/AdminUsersPage.tsx").read_text(encoding="utf-8")
    modals = (
        ROOT / "src/components/admin-users-page/AdminUsersPageModals.tsx"
    ).read_text(encoding="utf-8")
    helpers = (
        ROOT / "src/components/admin-users-page/admin-users-page-helpers.tsx"
    ).read_text(encoding="utf-8")
    actions = (
        ROOT / "src/components/admin-users-page/useAdminUsersPageActions.ts"
    ).read_text(encoding="utf-8")
    render = (ROOT / "src/lib/login-link-template-render.ts").read_text(
        encoding="utf-8"
    )
    pick = (
        ROOT / "src/components/admin-users-page/AdminUsersTemplatePickModal.tsx"
    )

    if not pick.is_file():
        return fail("missing AdminUsersTemplatePickModal.tsx")

    if "AdminUsersTemplatePickModal" not in modals:
        return fail("AdminUsersPageModals must render AdminUsersTemplatePickModal")

    if "openCopyWithTemplatePick" not in page:
        return fail("AdminUsersPage must open template pick before copy")

    if "onCopyWithTemplate={openCopyWithTemplatePick}" not in page:
        return fail("AdminUsersList must receive onCopyWithTemplate=openCopyWithTemplatePick")

    if "hasTemplates={templates.length > 0}" not in page:
        return fail("AdminUsersList must use hasTemplates, not a single selectedTemplate")

    if "selectedTemplate={" in page and "AdminUsersList" in page:
        # Allow preferred id elsewhere; list must not take selectedTemplate prop.
        list_block_start = page.find("<AdminUsersList")
        list_block_end = page.find("/>", list_block_start)
        list_block = page[list_block_start:list_block_end]
        if "selectedTemplate=" in list_block:
            return fail("AdminUsersList must not take selectedTemplate (pick modal instead)")

    if "先选择模板" not in helpers and "Pick a template" not in helpers:
        return fail("带模板复制 button title must say pick a template first")

    if "带模板「" in helpers:
        return fail("tooltip must not hardcode a single template name")

    if "renderAdminTemplateCredentialsCopy" not in actions:
        return fail("copyWithTemplate must use renderAdminTemplateCredentialsCopy")

    if "{quiz_url}" not in render or "{password}" not in render:
        return fail("template render must support {password} and {quiz_url}")

    if "adminUserQuizShareUrl" not in render:
        return fail("credentials copy must attach quiz share URL")

    print("[check_admin_users_copy_with_template] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
