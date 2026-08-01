#!/usr/bin/env python3
"""Regression: 禁止提交路径 → stop/pre-shell 钩子必须自动检测并从索引移除。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOKS_JSON = ROOT / ".cursor" / "hooks.json"
STOP_HOOK = ROOT / ".cursor" / "hooks" / "git-forbid-untrack-stop.py"
PRE_HOOK = ROOT / ".cursor" / "hooks" / "git-forbid-untrack-pre-shell.py"
LIB = ROOT / "scripts" / "git_forbid_paths.py"
CLI = ROOT / "scripts" / "untrack_forbidden_git_paths.py"
RULE = ROOT / ".cursor" / "rules" / "git-forbid-untrack.mdc"
QUICK = ROOT / "git-quick-commit.py"


def fail(msg: str) -> int:
    print(f"[check_git_forbid_untrack] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    for path in (HOOKS_JSON, STOP_HOOK, PRE_HOOK, LIB, CLI, RULE):
        if not path.is_file():
            return fail(f"missing {path.relative_to(ROOT)}")

    hooks = HOOKS_JSON.read_text(encoding="utf-8")
    if "git-forbid-untrack-stop.py" not in hooks:
        return fail("hooks.json stop must include git-forbid-untrack-stop.py")
    if "git-forbid-untrack-pre-shell.py" not in hooks:
        return fail("hooks.json beforeShellExecution must include git-forbid-untrack-pre-shell.py")

    stop_block = re.search(r'"stop"\s*:\s*\[(.*?)\]', hooks, re.S)
    if not stop_block:
        return fail("hooks.json missing stop array")
    block = stop_block.group(1)
    i_forbid = block.find("git-forbid-untrack-stop.py")
    i_feat = block.find("feature-remark-stop.py")
    if i_forbid < 0:
        return fail("stop missing git-forbid-untrack-stop")
    if i_feat >= 0 and i_forbid > i_feat:
        return fail("git-forbid-untrack-stop must run before feature-remark-stop")

    lib = LIB.read_text(encoding="utf-8")
    for needle in (
        "FORBIDDEN_PREFIXES",
        ".next/",
        "node_modules/",
        "def is_forbidden_path",
        "def untrack_paths",
        "def list_tracked_forbidden",
        "MAX_TRACKED_BLOB_BYTES",
    ):
        if needle not in lib:
            return fail(f"git_forbid_paths.py missing {needle}")

    cli = CLI.read_text(encoding="utf-8")
    if "list_tracked_forbidden" not in cli or "untrack_paths" not in cli:
        return fail("untrack_forbidden_git_paths.py must call shared helpers")
    if "--dry-run" not in cli:
        return fail("CLI must support --dry-run")

    stop = STOP_HOOK.read_text(encoding="utf-8")
    if "untrack_forbidden_git_paths.py" not in stop:
        return fail("stop hook must invoke untrack_forbidden_git_paths.py")
    if "file=sys.stderr" not in stop:
        return fail("stop hook status must go to stderr")

    pre = PRE_HOOK.read_text(encoding="utf-8")
    if "permission" not in pre or "deny" not in pre:
        return fail("pre-shell hook must deny when forbidden paths staged")
    if "untrack_paths" not in pre:
        return fail("pre-shell must untrack before gating")

    if QUICK.is_file():
        quick = QUICK.read_text(encoding="utf-8")
        if "from git_forbid_paths import" not in quick:
            return fail("git-quick-commit.py must import git_forbid_paths")
        if "FORBIDDEN_PREFIXES = (" in quick:
            return fail("git-quick-commit must not duplicate FORBIDDEN_PREFIXES")

    rule = RULE.read_text(encoding="utf-8")
    if "git rm --cached" not in rule and "untrack" not in rule.lower():
        return fail("rule must mention untrack / git rm --cached")
    if "git_forbid_paths" not in rule:
        return fail("rule must point to git_forbid_paths.py")

    print("[check_git_forbid_untrack] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
