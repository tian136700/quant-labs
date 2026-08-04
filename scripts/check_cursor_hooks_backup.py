#!/usr/bin/env python3
"""回归：Cursor 钩子须覆盖备份到 Documents/code/备份/（不进 Git）。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    script = ROOT / "scripts/backup_cursor_hooks.py"
    if not script.is_file():
        fail("missing scripts/backup_cursor_hooks.py")
    src = script.read_text(encoding="utf-8")
    if "备份" not in src or "strategy-compare-cloud" not in src:
        fail("backup script must target Documents/code/备份/strategy-compare-cloud")
    if ".state" not in src:
        fail("backup must skip hooks/.state")

    hook = ROOT / ".cursor/hooks/backup-cursor-hooks-after-edit.py"
    if not hook.is_file():
        fail("missing backup-cursor-hooks-after-edit.py")

    hooks_json = json.loads(
        (ROOT / ".cursor/hooks.json").read_text(encoding="utf-8")
    )
    cmds = [
        h.get("command", "")
        for h in (hooks_json.get("hooks") or {}).get("afterFileEdit", [])
        if isinstance(h, dict)
    ]
    if ".cursor/hooks/backup-cursor-hooks-after-edit.py" not in cmds:
        fail("hooks.json afterFileEdit must register backup hook")

    rule = ROOT / ".cursor/rules/cursor-hooks-backup.mdc"
    if not rule.is_file():
        fail("missing cursor-hooks-backup.mdc")
    rule_text = rule.read_text(encoding="utf-8")
    for needle in ("backup_cursor_hooks.py", "覆盖", "git add", "备份"):
        if needle not in rule_text:
            fail(f"rule missing {needle!r}")

    # 禁止备份目录被当成仓库内容跟踪（路径在仓库外则跳过）
    backup_root = ROOT.parent.parent / "备份" / "strategy-compare-cloud"
    if (ROOT / "备份").exists():
        fail("不要在仓库内建 备份/ 目录；应在 Documents/code/备份/")

    print(f"OK: cursor hooks backup wiring (dest expected at {backup_root})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
