#!/usr/bin/env python3
"""把本仓库 Cursor 钩子/规则覆盖备份到 Documents/code/备份/（不进 Git）。

目标（覆盖同步，不含本机 .state）：
  ~/Documents/code/备份/strategy-compare-cloud/
    hooks.json
    hooks/*.py|*.sh
    rules/*.mdc

用法：
  python3 scripts/backup_cursor_hooks.py
  python3 scripts/backup_cursor_hooks.py --dry-run
"""

from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# …/Documents/code/us_stock_monitor/strategy-compare-cloud → …/Documents/code/备份/…
BACKUP_ROOT = ROOT.parent.parent / "备份" / "strategy-compare-cloud"


def _clear_dir(path: Path, *, dry_run: bool) -> None:
    if not path.exists():
        return
    for child in path.iterdir():
        if dry_run:
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def _copy_file(src: Path, dest: Path, *, dry_run: bool) -> None:
    if dry_run:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def backup(*, dry_run: bool = False) -> dict:
    hooks_json = ROOT / ".cursor" / "hooks.json"
    hooks_dir = ROOT / ".cursor" / "hooks"
    rules_dir = ROOT / ".cursor" / "rules"

    if not hooks_json.is_file():
        raise SystemExit(f"missing {hooks_json}")
    if not hooks_dir.is_dir():
        raise SystemExit(f"missing {hooks_dir}")

    dest_hooks = BACKUP_ROOT / "hooks"
    dest_rules = BACKUP_ROOT / "rules"

    copied_hooks = 0
    copied_rules = 0

    if not dry_run:
        BACKUP_ROOT.mkdir(parents=True, exist_ok=True)

    _copy_file(hooks_json, BACKUP_ROOT / "hooks.json", dry_run=dry_run)

    # 钩子：整目录覆盖（先清空再拷，避免删掉的旧脚本残留）
    if not dry_run:
        dest_hooks.mkdir(parents=True, exist_ok=True)
        _clear_dir(dest_hooks, dry_run=False)
    for src in sorted(hooks_dir.iterdir()):
        if src.name in {".state", "__pycache__"}:
            continue
        if src.is_dir():
            continue
        if src.suffix not in {".py", ".sh"} and src.name != "hooks.json":
            # 只备份可执行钩子脚本
            if src.suffix not in {".py", ".sh"}:
                continue
        _copy_file(src, dest_hooks / src.name, dry_run=dry_run)
        copied_hooks += 1

    # 规则：一并备份（换机同样会丢；与钩子同属 Cursor 工作区配置）
    if rules_dir.is_dir():
        if not dry_run:
            dest_rules.mkdir(parents=True, exist_ok=True)
            _clear_dir(dest_rules, dry_run=False)
        for src in sorted(rules_dir.glob("*.mdc")):
            _copy_file(src, dest_rules / src.name, dry_run=dry_run)
            copied_rules += 1

    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %z")
    readme = (
        "Cursor 钩子/规则备份（覆盖同步）\n"
        f"来源仓库：{ROOT}\n"
        f"上次备份：{now}\n"
        "不含 hooks/.state（本机指纹/部署状态，勿拷到云端当源）。\n"
        "恢复：把 hooks.json、hooks/、rules/ 拷回仓库 .cursor/ 即可。\n"
        "不要 git add 本目录；由云盘/自己同步即可。\n"
    )
    if not dry_run:
        (BACKUP_ROOT / "README.txt").write_text(readme, encoding="utf-8")
        (BACKUP_ROOT / "LAST_BACKUP.txt").write_text(now + "\n", encoding="utf-8")

    return {
        "ok": True,
        "dry_run": dry_run,
        "backup_root": str(BACKUP_ROOT),
        "hooks": copied_hooks,
        "rules": copied_rules,
        "at": now,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    result = backup(dry_run=args.dry_run)
    if args.json:
        import json

        print(json.dumps(result, ensure_ascii=False))
    else:
        print(
            f"OK: backup → {result['backup_root']} "
            f"(hooks={result['hooks']} rules={result['rules']}) "
            f"at {result['at']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
