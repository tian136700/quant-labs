#!/usr/bin/env python3
"""回归：用户管理复制凭证 / 登录链接按老师身份选子域名（日语→japanese）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []
    slug = (ROOT / "src/lib/login-link-slug.ts").read_text(encoding="utf-8")
    cred = (ROOT / "src/lib/admin-user-credentials.ts").read_text(encoding="utf-8")
    actions = (
        ROOT / "src/components/admin-users-page/useAdminUsersPageActions.ts"
    ).read_text(encoding="utf-8")
    login = (
        ROOT / "src/app/api/admin/users/login-link/route.ts"
    ).read_text(encoding="utf-8")

    if "loginLinkSiteForTeacher" not in slug:
        errors.append("login-link-slug must export loginLinkSiteForTeacher")
    if not re.search(
        r"loginLinkSiteForTeacher[\s\S]*?modules\?\.jp[\s\S]*?return \"jp\"",
        slug,
    ):
        errors.append("loginLinkSiteForTeacher must prefer modules.jp → jp")

    if "loginLinkSiteForTeacher" not in cred:
        errors.append("adminUserQuizShareUrl must use loginLinkSiteForTeacher")
    if "teacher_modules" not in actions:
        errors.append("copy credentials must pass row.teacher_modules")
    if "loginLinkSiteForTeacher" not in login:
        errors.append("login-link API must use loginLinkSiteForTeacher")
    if "detectTeacherModules" not in login:
        errors.append("login-link API must detectTeacherModules from extras")

    if errors:
        print("check_admin_user_credentials_site FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_admin_user_credentials_site OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
