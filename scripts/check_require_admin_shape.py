#!/usr/bin/env python3
"""禁止把 requireAdmin 当成 requirePermission：返回 isAdmin，没有 allowed。

曾导致 Next 构建挂：Property 'allowed' does not exist on type
'{ env; user; isAdmin }'（en-lesson backfill_vocab_sync）。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

# const { allowed } = await requireAdmin(...)
_DESTRUCTURE_ALLOWED_RE = re.compile(
    r"const\s*\{[^{}]*\ballowed\b[^{}]*\}\s*=\s*await\s+requireAdmin\s*\(",
    re.MULTILINE,
)

# const admin = await requireAdmin(...); ... admin.allowed
_ASSIGN_RE = re.compile(
    r"const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*await\s+requireAdmin\s*\(",
    re.MULTILINE,
)


def find_require_admin_allowed_misuse(
    root: Path | None = None,
) -> list[str]:
    """返回错误文案；空 = 通过。"""
    base = root or ROOT
    src = base / "src"
    errors: list[str] = []
    if not src.is_dir():
        return errors

    for path in sorted(src.rglob("*.ts")):
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(base).as_posix()
        for m in _DESTRUCTURE_ALLOWED_RE.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            errors.append(
                f"{rel}:{line}: requireAdmin 无 allowed 字段，请解构 isAdmin"
            )
        for m in _ASSIGN_RE.finditer(text):
            name = m.group(1)
            # 赋值之后到文件末尾（或下一顶层 const）找 name.allowed
            after = text[m.end() :]
            # 限制在同函数附近：往后最多 ~40 行
            window = "\n".join(after.splitlines()[:40])
            bad = re.search(rf"\b{re.escape(name)}\.allowed\b", window)
            if bad:
                line = text.count("\n", 0, m.start()) + 1
                errors.append(
                    f"{rel}:{line}: `{name} = await requireAdmin(...)` 后勿读 "
                    f"`{name}.allowed`（应使用 isAdmin）"
                )
    return errors


def assert_gates_wired(root: Path | None = None) -> list[str]:
    """确认 predeploy / stop 已接线，避免门禁脚本孤儿。"""
    base = root or ROOT
    errors: list[str] = []
    predeploy = (base / "scripts/predeploy-clean.py").read_text(encoding="utf-8")
    if "run_require_admin_shape_guard" not in predeploy:
        errors.append("predeploy-clean.py must call run_require_admin_shape_guard")
    if "check_require_admin_shape.py" not in predeploy:
        errors.append("predeploy-clean.py must invoke check_require_admin_shape.py")
    stop = base / ".cursor/hooks/feature-remark-stop.py"
    if stop.is_file():
        stop_text = stop.read_text(encoding="utf-8")
        if "find_require_admin_allowed_misuse" not in stop_text:
            errors.append(
                "feature-remark-stop.py must run find_require_admin_allowed_misuse"
            )
    rule = base / ".cursor/rules/require-admin-is-admin.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/require-admin-is-admin.mdc")
    return errors


def main() -> int:
    errors = find_require_admin_allowed_misuse() + assert_gates_wired()
    if errors:
        print("FAIL requireAdmin shape (isAdmin, not allowed)")
        for e in errors:
            print(f"  {e}")
        print(
            "hint: requireAdmin → { env, user, isAdmin }; "
            "allowed 属于 requirePermission / requireAdminArea"
        )
        return 1
    print("OK requireAdmin returns isAdmin (no .allowed misuse)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
