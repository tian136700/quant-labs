#!/usr/bin/env python3
"""改代码后空闲一段时间，自动 git add + commit + push（调用 git-quick-commit.py）。"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUICK_COMMIT = ROOT / "git-quick-commit.py"
LOG_PREFIX = "[git-auto-push]"

IDLE_SECONDS = int(os.environ.get("GIT_AUTO_PUSH_IDLE", "600"))
POLL_SECONDS = int(os.environ.get("GIT_AUTO_PUSH_POLL", "30"))

SKIP_DIRS = {
    ".git",
    "node_modules",
    ".next",
    ".open-next",
    ".wrangler",
    "tmp",
    ".history",
    "__pycache__",
    ".idea",
}
SKIP_FILE_SUFFIXES = (".log", ".sqlite", ".sqlite-wal", ".sqlite-shm", ".tsbuildinfo")


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{LOG_PREFIX} {ts} {msg}", flush=True)


def run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )


def latest_worktree_mtime() -> float:
    newest = 0.0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        base = Path(dirpath)
        for name in filenames:
            if name.startswith(".env"):
                continue
            if name.endswith(SKIP_FILE_SUFFIXES):
                continue
            path = base / name
            try:
                newest = max(newest, path.stat().st_mtime)
            except OSError:
                pass
    return newest


def has_local_changes() -> bool:
    status = run_git("status", "--porcelain")
    return bool(status.stdout.strip())


def unpushed_commit_count() -> int:
    branch = run_git("rev-parse", "--abbrev-ref", "HEAD")
    if branch.returncode != 0:
        return 0
    head = branch.stdout.strip()
    if not head or head == "HEAD":
        return 0
    proc = run_git("rev-list", "--count", f"origin/{head}..HEAD")
    if proc.returncode != 0:
        return 0
    text = proc.stdout.strip()
    return int(text) if text.isdigit() else 0


def needs_git_action() -> bool:
    return has_local_changes() or unpushed_commit_count() > 0


def auto_commit_push() -> bool:
    if not QUICK_COMMIT.is_file():
        log(f"未找到 {QUICK_COMMIT.name}，跳过")
        return False
    proc = subprocess.run(
        [sys.executable, str(QUICK_COMMIT)],
        cwd=ROOT,
        text=True,
    )
    if proc.returncode != 0:
        log(f"git-quick-commit 失败，退出码 {proc.returncode}")
        return False
    return True


def format_idle(seconds: float) -> str:
    mins, secs = divmod(int(seconds), 60)
    if mins:
        return f"{mins}分{secs}秒"
    return f"{secs}秒"


def main() -> int:
    log(
        f"开始监听 {ROOT.name}，空闲 {format_idle(IDLE_SECONDS)} 后自动提交并推送"
    )
    last_activity = latest_worktree_mtime()
    if last_activity <= 0:
        last_activity = time.time()

    while True:
        try:
            newest = latest_worktree_mtime()
            if newest > last_activity:
                last_activity = newest
                log("检测到文件改动，重置空闲计时")

            idle_for = time.time() - last_activity
            if idle_for >= IDLE_SECONDS and needs_git_action():
                log(
                    f"已空闲 {format_idle(idle_for)}，开始自动 commit + push …"
                )
                if auto_commit_push():
                    log("自动提交并推送完成")
                    last_activity = time.time()
                else:
                    log("本次自动推送未成功，10 分钟后会再试")
                    last_activity = time.time()
        except KeyboardInterrupt:
            log("收到退出信号")
            return 0
        except Exception as exc:  # noqa: BLE001 — 守护进程需持续运行
            log(f"轮询异常: {exc}")

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
