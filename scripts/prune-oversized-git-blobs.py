#!/usr/bin/env python3
"""清理 Git 历史中的超大 blob（主要是膨胀的 .gitignore），避免 IDE git blame 吃光内存。

默认仅预览；加 --apply 才会改写历史（之后需 force push）。

依赖：git-filter-repo（脚本会尝试 python3 -m pip install --user git-filter-repo）
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# 与 auto_ignore_local_files.py 保持一致
MAX_BLOB_BYTES = 256 * 1024


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if check and proc.returncode != 0:
        err = proc.stderr.strip() or proc.stdout.strip() or "command failed"
        raise RuntimeError(f"{' '.join(cmd)}\n{err}")
    return proc


def ensure_git_filter_repo() -> str:
    if shutil.which("git-filter-repo"):
        return "git-filter-repo"
    proc = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--user", "git-filter-repo"],
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            "未找到 git-filter-repo，且自动安装失败。\n"
            f"{proc.stderr.strip() or proc.stdout.strip()}"
        )
    if shutil.which("git-filter-repo"):
        return "git-filter-repo"
    user_bin = Path.home() / "Library" / "Python"
    for candidate in user_bin.glob("*/bin/git-filter-repo"):
        return str(candidate)
    raise RuntimeError("git-filter-repo 安装后仍不可用，请手动加入 PATH 后重试")


def list_oversized_blobs(limit: int = 20) -> list[tuple[int, str]]:
    rev = run(["git", "rev-list", "--objects", "--all"])
    proc = subprocess.run(
        ["git", "cat-file", "--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)"],
        cwd=ROOT,
        input=rev.stdout,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    rows: list[tuple[int, str]] = []
    for line in proc.stdout.splitlines():
        parts = line.split(maxsplit=3)
        if len(parts) < 4 or parts[0] != "blob":
            continue
        size = int(parts[2])
        if size > MAX_BLOB_BYTES:
            rows.append((size, parts[3]))
    rows.sort(reverse=True)
    return rows[:limit]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="实际改写 Git 历史（不可逆，之后需 git push --force）",
    )
    args = parser.parse_args()

    if not (ROOT / ".git").is_dir():
        print("错误：未在 Git 仓库根目录运行", file=sys.stderr)
        return 1

    oversized = list_oversized_blobs(limit=30)
    if not oversized:
        print(f"[prune] 历史中无超过 {MAX_BLOB_BYTES} 字节的 blob")
        return 0

    print(f"[prune] 超过 {MAX_BLOB_BYTES} 字节的 blob（前 {len(oversized)} 个）：")
    for size, path in oversized:
        print(f"  {size / 1024 / 1024:.2f} MB  {path}")

    if not args.apply:
        print(
            "\n[prune] 预览模式，未改写历史。确认后执行：\n"
            f"  {sys.executable} {Path(__file__).name} --apply"
        )
        return 0

    if run(["git", "status", "--porcelain"]).stdout.strip():
        print("错误：工作区有未提交改动，请先提交或暂存后再运行", file=sys.stderr)
        return 1

    tool = ensure_git_filter_repo()
    print(f"[prune] 使用 {tool} 剥离 > {MAX_BLOB_BYTES} 字节的 blob…", flush=True)
    run(
        [
            tool,
            f"--strip-blobs-bigger-than={MAX_BLOB_BYTES}",
            "--force",
        ],
        check=True,
    )
    print(
        "[prune] 完成。请执行：\n"
        "  git reflog expire --expire=now --all && git gc --prune=now --aggressive\n"
        "  git push --force-with-lease"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
