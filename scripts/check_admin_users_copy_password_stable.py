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

    # 复制成功后须弹窗核对用户名/密码（勿只 toast）
    if "openCredentialsConfirm" not in actions:
        return fail("copy success must openCredentialsConfirm for username/password review")
    copy_fn = actions.split("const copyUserCredentials", 1)[1].split(
        "const resetUserPassword", 1
    )[0]
    if "openCredentialsConfirm" not in copy_fn:
        return fail("copyUserCredentials must call openCredentialsConfirm after successful copy")

    modal = ROOT / "src/components/admin-users-page/AdminUsersCredentialsConfirmModal.tsx"
    if not modal.is_file():
        return fail("AdminUsersCredentialsConfirmModal.tsx missing")
    modal_src = modal.read_text(encoding="utf-8")
    if "确认无误" not in modal_src and "Looks correct" not in modal_src:
        return fail("credentials confirm modal must show confirm CTA")
    if "credentials.username" not in modal_src or "credentials.password" not in modal_src:
        return fail("credentials confirm modal must display username and password")

    print("[check_admin_users_copy_password_stable] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
