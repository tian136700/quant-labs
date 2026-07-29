#!/usr/bin/env python3
"""Regression: 新增日语上课老师须自动创建/关联用户账号（人员管理 + 用户管理）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / "src/app/api/admin/jp-lesson-teachers/route.ts"


def main() -> int:
    text = ROUTE.read_text(encoding="utf-8")
    failed = False

    checks = [
        (r"createJpLessonTeacher\(", "create teacher"),
        (r"ensureJpLessonTeacherUserAccount\(", "auto user + link"),
        (r"user_account:\s*userAccount", "return user_account"),
    ]
    for pat, label in checks:
        if not re.search(pat, text):
            print(f"FAIL jp-lesson-teachers POST create: missing {label} /{pat}/")
            failed = True

    if failed:
        return 1
    print("OK: jp-lesson teacher create auto-provisions user account")
    return 0


if __name__ == "__main__":
    sys.exit(main())
