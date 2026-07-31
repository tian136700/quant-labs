#!/usr/bin/env python3
"""回归：复制账号密码须优先本机缓存，禁止每次都 reset-password。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> int:
    print(f"[check_admin_users_copy_password_stable] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    actions = (
        ROOT / "src/components/admin-users-page/useAdminUsersPageActions.ts"
    ).read_text(encoding="utf-8")

    if "resolvePasswordForCopy" not in actions:
        return fail("resolvePasswordForCopy missing")

    fn = actions.split("const resolvePasswordForCopy", 1)[1].split(
        "const generateLoginLink", 1
    )[0]

    if "readAdminUserPassword" not in fn:
        return fail("resolvePasswordForCopy must readAdminUserPassword first")

    if "if (cached)" not in fn and "if (cached)" not in fn.replace(" ", ""):
        # allow `if (cached) return cached`
        if not re.search(r"if\s*\(\s*cached\s*\)", fn):
            return fail("resolvePasswordForCopy must return cached password when present")

    # 禁止整段只等于 requestPasswordReset（旧坏实现）
    one_liner = re.sub(r"\s+", " ", fn)
    if re.search(
        r"resolvePasswordForCopy[^=]*=\s*async[^=]*=>\s*requestPasswordReset",
        "const resolvePasswordForCopy" + one_liner,
    ):
        return fail("copy must not always requestPasswordReset")

    if "requestPasswordReset" in fn and "confirm" not in fn:
        return fail("reset-on-copy without cache must confirm first")

    if "isReservedUsername" not in fn:
        return fail("no-cache bootstrap accounts must be blocked in resolvePasswordForCopy")

    print("[check_admin_users_copy_password_stable] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
