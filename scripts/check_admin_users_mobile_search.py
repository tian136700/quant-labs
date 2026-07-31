#!/usr/bin/env python3
"""回归：用户管理手机端搜索框整行拉满，禁止无条件 align-items:flex-end 盖掉 stretch。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOBILE = ROOT / "src/app/mobile/mobile-jp-notes-admin.css"
STYLES = ROOT / "src/components/admin-users-page/AdminUsersPageStyles.tsx"


def main() -> int:
    mobile = MOBILE.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")
    errors: list[str] = []

    # flex-end only allowed inside min-width:768px (unconditional overrides mobile stretch).
    flex_end_hits = list(
        re.finditer(
            r"\.admin-users-search-bar\s*\{[^}]*align-items:\s*flex-end",
            styles,
            re.S,
        )
    )
    if not flex_end_hits:
        errors.append(
            "AdminUsersPageStyles: missing desktop .admin-users-search-bar "
            "align-items:flex-end (expected inside @media min-width:768px)"
        )
    for m in flex_end_hits:
        before = styles[max(0, m.start() - 120) : m.start()]
        if not re.search(r"@media\s*\(\s*min-width:\s*768px\s*\)\s*\{\s*$", before, re.S):
            errors.append(
                "AdminUsersPageStyles: align-items:flex-end on "
                ".admin-users-search-bar must be inside @media (min-width: 768px) "
                "(unconditional rule overrides mobile stretch → search misaligned)"
            )

    if not re.search(
        r"\.admin-users-search-bar\s*\{[^}]*align-items:\s*stretch",
        mobile,
        re.S,
    ):
        errors.append("mobile: .admin-users-search-bar must use align-items: stretch")

    if not re.search(
        r"\.admin-users-search-bar\s+\.admin-rbac-search-field\s*\{[^}]*width:\s*100%",
        mobile,
        re.S,
    ):
        errors.append(
            "mobile: .admin-users-search-bar .admin-rbac-search-field must be width: 100%"
        )

    if not re.search(
        r"\.admin-users-search-bar\s+\.admin-rbac-search-input\s*\{[^}]*width:\s*100%",
        mobile,
        re.S,
    ):
        errors.append(
            "mobile: .admin-users-search-bar .admin-rbac-search-input must be width: 100%"
        )

    if errors:
        print("check_admin_users_mobile_search FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_admin_users_mobile_search OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
