#!/usr/bin/env python3
"""Regression: 复制账号密码 / 自动建老师账号须用易记词组密码，禁止随机乱码。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
USERS = ROOT / "src/lib/etr-auth-db/users.ts"


def main() -> int:
    text = USERS.read_text(encoding="utf-8")
    failed = False

    if not re.search(
        r"resetUserPasswordByAdmin[\s\S]*?generateMemorableTeacherPassword\(",
        text,
    ):
        print("FAIL: resetUserPasswordByAdmin must use generateMemorableTeacherPassword")
        failed = True

    if re.search(
        r"resetUserPasswordByAdmin[\s\S]*?generateAdminResetPassword\(",
        text,
    ):
        print("FAIL: resetUserPasswordByAdmin must not use generateAdminResetPassword")
        failed = True

    if not re.search(r'return `\$\{pick\(wordsA\)\}-\$\{pick\(wordsB\)\}-\$\{digits\}`', text):
        print("FAIL: generateMemorableTeacherPassword must use word-word-digits hyphen format")
        failed = True

    if failed:
        return 1
    print("OK: copy/reset passwords use memorable hyphenated word format")
    return 0


if __name__ == "__main__":
    sys.exit(main())
