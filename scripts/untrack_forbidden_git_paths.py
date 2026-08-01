#!/usr/bin/env python3
"""检测并从未应提交的路径上解除 Git 跟踪（git rm --cached）。

用法：
  python3 scripts/untrack_forbidden_git_paths.py           # 检测并移除
  python3 scripts/untrack_forbidden_git_paths.py --dry-run # 只列出
  python3 scripts/untrack_forbidden_git_paths.py --json    # JSON 摘要（钩子用）
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from git_forbid_paths import (  # noqa: E402
    ensure_gitignore_has_required,
    list_tracked_forbidden,
    untrack_paths,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只列出应解除跟踪的路径，不改索引",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="向 stdout 打印 JSON 摘要",
    )
    parser.add_argument(
        "--skip-gitignore",
        action="store_true",
        help="不自动补 .gitignore 必要规则",
    )
    args = parser.parse_args()

    if not (ROOT / ".git").is_dir():
        msg = {"ok": False, "error": "not a git repo", "forbidden": [], "removed": []}
        if args.json:
            print(json.dumps(msg, ensure_ascii=False))
        else:
            print("[git-forbid] 非 Git 仓库，跳过", flush=True)
        return 0

    forbidden = list_tracked_forbidden(ROOT)
    gitignore_added: list[str] = []
    if not args.dry_run and not args.skip_gitignore:
        gitignore_added = ensure_gitignore_has_required(ROOT)

    removed: list[str] = []
    if forbidden and not args.dry_run:
        removed = untrack_paths(ROOT, forbidden)

    payload = {
        "ok": True,
        "dry_run": bool(args.dry_run),
        "forbidden": forbidden,
        "removed": removed,
        "gitignore_added": gitignore_added,
        "count": len(forbidden),
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    if gitignore_added:
        print("[git-forbid] 已补 .gitignore 规则：", flush=True)
        for rule in gitignore_added:
            print(f"  + {rule}", flush=True)

    if not forbidden:
        print("[git-forbid] 索引中无禁止提交路径", flush=True)
        return 0

    if args.dry_run:
        print(f"[git-forbid] 发现 {len(forbidden)} 个不应跟踪的路径（dry-run）：", flush=True)
        for path in forbidden[:50]:
            print(f"  - {path}", flush=True)
        if len(forbidden) > 50:
            print(f"  … 另有 {len(forbidden) - 50} 个", flush=True)
        return 0

    print(
        f"[git-forbid] 已从 Git 索引移除 {len(removed)}/{len(forbidden)} 个禁止路径"
        "（文件仍留在磁盘）",
        flush=True,
    )
    for path in removed[:30]:
        print(f"  - {path}", flush=True)
    if len(removed) > 30:
        print(f"  … 另有 {len(removed) - 30} 个", flush=True)
    leftover = [p for p in forbidden if p not in removed]
    if leftover:
        print(f"[git-forbid] 警告：{len(leftover)} 个未能移除", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
