#!/usr/bin/env python3
"""回归：人员管理手机端搜索框不与「搜索」按钮重叠；无结果「查无此人」。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOBILE = ROOT / "src/app/mobile/mobile-jp-notes-admin.css"
LIST = (
    ROOT
    / "src/components/admin-jp-lesson-teachers-page/AdminJpLessonTeachersList.tsx"
)


def main() -> int:
    mobile = MOBILE.read_text(encoding="utf-8")
    listing = LIST.read_text(encoding="utf-8")
    errors: list[str] = []

    if ".admin-jpl-search-combo" not in mobile:
        errors.append("mobile CSS must style .admin-jpl-search-combo on phone")
    if not re.search(
        r"\.admin-jpl-teachers-toolbar\s+\.admin-jpl-search-combo\s*\{[^}]*grid-column:\s*1\s*/\s*-1",
        mobile,
        re.S,
    ):
        errors.append(
            "mobile: .admin-jpl-search-combo must span full row (grid-column: 1 / -1)"
        )
    if not re.search(
        r"\.admin-jpl-search-combo\s*~\s*\.btn-rsi-filter\s*\{[^}]*grid-column:\s*1\s*/\s*-1",
        mobile,
        re.S,
    ):
        errors.append(
            "mobile: search/clear buttons after combo must span full row"
        )

    if "查无此人" not in listing:
        errors.append("AdminJpLessonTeachersList empty search must say 查无此人")

    if errors:
        print("check_admin_jpl_teachers_mobile_search FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_admin_jpl_teachers_mobile_search OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
