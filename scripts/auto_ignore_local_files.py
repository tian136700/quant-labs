#!/usr/bin/env python3
"""提交前自动补全 .gitignore（仅针对本地运维/临时文件）。"""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GITIGNORE = ROOT / ".gitignore"
MARK_BEGIN = "# auto-ignore-local begin"
MARK_END = "# auto-ignore-local end"

# 明确属于本地运维/无人值守辅助工具，不参与线上代码。
FIXED_LOCAL_PATTERNS = [
    "scripts/deploy_center/",
]
PROTECTED_TRACKED_RULES = {
    "scripts/auto_ignore_local_files.py",
}

PATH_HINTS = (
    "/tmp/",
    "/logs/",
    "/local/",
    "/backup/",
    "/cache/",
    "/snapshots/",
    ".cursor/",
)

NAME_HINTS = (
    "local",
    "backup",
    "snapshot",
    "dump",
    "export",
    "token",
    "secret",
    "credential",
    "state",
    "debug",
)

SUFFIX_HINTS = (
    ".log",
    ".sqlite",
    ".sqlite3",
    ".sqlite-wal",
    ".sqlite-shm",
    ".db",
    ".dump.sql",
    ".export.sql",
)
CODE_SUFFIXES = (
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".html",
    ".md",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".sql",
)


def git_output(*args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout.strip()


def candidate_paths() -> list[str]:
    changed = git_output("diff", "--name-only").splitlines()
    staged = git_output("diff", "--cached", "--name-only").splitlines()
    untracked = git_output("ls-files", "--others", "--exclude-standard").splitlines()
    seen: set[str] = set()
    out: list[str] = []
    for p in [*changed, *staged, *untracked]:
        p = p.strip().replace("\\", "/")
        if not p or p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def should_ignore(path: str) -> bool:
    low = path.lower()
    if low.startswith("scripts/deploy_center/"):
        return True
    if any(low.endswith(s) for s in CODE_SUFFIXES):
        return False
    if any(h in f"/{low}" for h in PATH_HINTS):
        return True
    name = low.rsplit("/", 1)[-1]
    if any(k in name for k in NAME_HINTS):
        return True
    if any(low.endswith(s) for s in SUFFIX_HINTS):
        return True
    return False


def normalize_rule(path: str) -> str:
    if path.endswith("/"):
        return path
    abs_path = ROOT / path
    if abs_path.is_dir():
        return f"{path}/"
    return path


def load_gitignore_lines() -> list[str]:
    if not GITIGNORE.is_file():
        return []
    return GITIGNORE.read_text(encoding="utf-8").splitlines()


def split_managed_block(lines: list[str]) -> tuple[list[str], set[str]]:
    if MARK_BEGIN not in lines or MARK_END not in lines:
        return lines, set()
    start = lines.index(MARK_BEGIN)
    end = lines.index(MARK_END)
    managed = {ln.strip() for ln in lines[start + 1 : end] if ln.strip()}
    base = lines[:start] + lines[end + 1 :]
    return base, managed


def write_gitignore(base_lines: list[str], managed_rules: set[str]) -> bool:
    new_lines = list(base_lines)
    block = sorted(r for r in managed_rules if r)
    if block:
        if new_lines and new_lines[-1] != "":
            new_lines.append("")
        new_lines.append(MARK_BEGIN)
        new_lines.extend(block)
        new_lines.append(MARK_END)
    before = "\n".join(load_gitignore_lines()).strip()
    after = "\n".join(new_lines).strip()
    if before == after:
        return False
    GITIGNORE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    return True


def main() -> int:
    candidates = candidate_paths()
    auto_rules = {normalize_rule(p) for p in candidates if should_ignore(p)}
    auto_rules.update(FIXED_LOCAL_PATTERNS)

    raw_lines = load_gitignore_lines()
    base_lines, old_managed = split_managed_block(raw_lines)
    old_managed = {r for r in old_managed if r not in PROTECTED_TRACKED_RULES}
    merged = old_managed | auto_rules

    changed = write_gitignore(base_lines, merged)
    if not changed:
        print("[auto-ignore] .gitignore 无新增规则", flush=True)
        return 0

    added = sorted(merged - old_managed)
    if added:
        print("[auto-ignore] 已自动加入忽略规则：", flush=True)
        for rule in added:
            print(f"  - {rule}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
