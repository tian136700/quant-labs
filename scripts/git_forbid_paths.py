#!/usr/bin/env python3
"""禁止提交到 Git 的路径约定（共享给 stop 钩子 / git-quick-commit / 校验脚本）。

已入库的匹配路径应 `git rm --cached`（保留工作区文件，只从索引移除）。
"""

from __future__ import annotations

import subprocess
from pathlib import Path

# 与 git-quick-commit / .gitignore 对齐：构建产物、密钥、本地运维、IDE 状态等
FORBIDDEN_PREFIXES: tuple[str, ...] = (
    "node_modules/",
    ".next/",
    ".open-next/",
    ".wrangler/",
    ".turbo/",
    "dist/",
    "out/",
    ".vercel/",
    "coverage/",
    ".nyc_output/",
    ".history/",
    ".cursor/",
    ".idea/",
    ".vscode/",
    "tmp/",
    ".venv/",
    "venv/",
    "__pycache__/",
    "wechat-jp-vocab-review/",
    "scripts/deploy_center/",
    "scripts/maintenance_center/",
    "trend_aggregator/",
    "local-src/",
)

FORBIDDEN_FILES: frozenset[str] = frozenset(
    {
        ".env",
        ".env.local",
        ".env.production",
        ".env.deploy.local",
        ".DS_Store",
        "Thumbs.db",
        "Desktop.ini",
        "kill-port.py",
        "git-quick-commit.py",
        ".git-auto-push-state.json",
        ".publish-console.job.lock",
        ".remote-d1-snapshot.sql",
        "scripts/.remote-d1-snapshot.sql",
        "scripts/sync-d1-remote-to-local.py",
        "scripts/jp-review-sync.py",
        "scripts/jp-vocab-sync.py",
        "scripts/git_commit_message.py",
        "scripts/publish-trend-blog.py",
        "scripts/trend_blog_markdown.py",
        "scripts/import-trends-json.py",
        "scripts/backfill-visit-geo.py",
    }
)

FORBIDDEN_SUFFIXES: tuple[str, ...] = (
    ".log",
    ".sqlite",
    ".sqlite3",
    ".sqlite-wal",
    ".sqlite-shm",
    ".db",
    ".pem",
    ".key",
    ".p12",
    ".pack",
    ".tsbuildinfo",
    ".pyc",
    ".dump.sql",
    ".export.sql",
    "-dump.sql",
    "-export.sql",
    "-backup.sql",
    "-inserts.sql",
)

# 单文件超过此大小不得进入索引（与 git-quick-commit 推送闸一致）
MAX_TRACKED_BLOB_BYTES = 95 * 1024 * 1024

# 这些目录级规则必须在 .gitignore 里（避免只 untrack 后又被 add）
REQUIRED_GITIGNORE_RULES: tuple[str, ...] = (
    "node_modules/",
    ".next/",
    ".open-next/",
    ".wrangler/",
    "tmp/",
    ".cursor/",
    "scripts/deploy_center/",
)


def normalize_git_path(path: str) -> str:
    norm = path.replace("\\", "/")
    while norm.startswith("./"):
        norm = norm[2:]
    return norm


def is_forbidden_path(path: str) -> bool:
    norm = normalize_git_path(path)
    if not norm or norm == ".gitignore":
        return False
    if norm in FORBIDDEN_FILES:
        return True
    # .env.* except allowlisted examples
    name = norm.rsplit("/", 1)[-1]
    if name.startswith(".env") and name not in (
        ".env.example",
        ".env.deploy.local.example",
    ):
        return True
    if any(norm.startswith(prefix) for prefix in FORBIDDEN_PREFIXES):
        return True
    if "/__pycache__/" in f"/{norm}/" or norm.endswith("/__pycache__"):
        return True
    low = norm.lower()
    if any(low.endswith(suf) for suf in FORBIDDEN_SUFFIXES):
        return True
    if low.endswith(".plist") and not low.endswith(".plist.example"):
        if "com.infoquests." in low:
            return True
    return False


def git_output(root: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=root,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout


def list_tracked_paths(root: Path) -> list[str]:
    out = git_output(root, "ls-files", "-z")
    if not out:
        # empty repo or not a git dir
        raw = git_output(root, "ls-files")
        return [normalize_git_path(p) for p in raw.splitlines() if p.strip()]
    paths: list[str] = []
    for part in out.split("\0"):
        p = normalize_git_path(part)
        if p:
            paths.append(p)
    return paths


def list_oversized_tracked(root: Path) -> list[str]:
    """已跟踪且工作区文件 > MAX_TRACKED_BLOB_BYTES。"""
    bad: list[str] = []
    for path in list_tracked_paths(root):
        abs_path = root / path
        try:
            if abs_path.is_file() and abs_path.stat().st_size > MAX_TRACKED_BLOB_BYTES:
                bad.append(path)
        except OSError:
            continue
    return bad


def list_tracked_forbidden(root: Path) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for path in list_tracked_paths(root):
        if is_forbidden_path(path) and path not in seen:
            seen.add(path)
            out.append(path)
    for path in list_oversized_tracked(root):
        if path not in seen:
            seen.add(path)
            out.append(path)
    return out


def untrack_paths(root: Path, paths: list[str]) -> list[str]:
    """从索引移除；保留磁盘文件。返回实际处理的路径。"""
    if not paths:
        return []
    removed: list[str] = []
    batch_size = 80
    for start in range(0, len(paths), batch_size):
        batch = paths[start : start + batch_size]
        proc = subprocess.run(
            ["git", "rm", "-r", "--cached", "-f", "--", *batch],
            cwd=root,
            text=True,
            capture_output=True,
        )
        if proc.returncode == 0:
            removed.extend(batch)
            continue
        # 逐条重试（目录/已删等情况）
        for path in batch:
            one = subprocess.run(
                ["git", "rm", "-r", "--cached", "-f", "--", path],
                cwd=root,
                text=True,
                capture_output=True,
            )
            if one.returncode == 0:
                removed.append(path)
    return removed


def ensure_gitignore_has_required(root: Path) -> list[str]:
    """确保关键目录规则在 .gitignore 中；返回本次新增的规则。"""
    gi = root / ".gitignore"
    if not gi.is_file():
        return []
    text = gi.read_text(encoding="utf-8")
    lines = text.splitlines()
    existing = {ln.strip() for ln in lines if ln.strip() and not ln.strip().startswith("#")}
    added: list[str] = []
    for rule in REQUIRED_GITIGNORE_RULES:
        if rule in existing:
            continue
        added.append(rule)
    if not added:
        return []
    # 插在文件前部固定区（auto-ignore 块之前）
    mark = "# auto-ignore-local begin"
    if mark in lines:
        idx = lines.index(mark)
        insert_at = idx
        while insert_at > 0 and lines[insert_at - 1].strip() == "":
            insert_at -= 1
        block = ["# git-forbid required"] + added + [""]
        new_lines = lines[:insert_at] + block + lines[insert_at:]
    else:
        new_lines = list(lines)
        if new_lines and new_lines[-1].strip():
            new_lines.append("")
        new_lines.append("# git-forbid required")
        new_lines.extend(added)
    gi.write_text("\n".join(new_lines).rstrip() + "\n", encoding="utf-8")
    return added
