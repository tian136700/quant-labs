#!/usr/bin/env python3
"""单次检查：改代码空闲满 N 秒则自动 commit + push（供 crontab 每分钟调用）。"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUICK_COMMIT = ROOT / "git-quick-commit.py"
STATE_FILE = Path(
    os.environ.get(
        "GIT_AUTO_PUSH_STATE",
        f"/tmp/git-auto-push-{ROOT.name}.json",
    )
)
LOG_PREFIX = "[git-auto-push]"

IDLE_SECONDS = int(os.environ.get("GIT_AUTO_PUSH_IDLE", "600"))

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


def load_last_activity() -> float:
    if not STATE_FILE.is_file():
        return 0.0
    try:
        import json

        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return float(data.get("last_activity", 0.0))
    except (OSError, ValueError, TypeError):
        return 0.0


def save_last_activity(ts: float) -> None:
    import json

    STATE_FILE.write_text(
        json.dumps({"last_activity": ts}, ensure_ascii=False),
        encoding="utf-8",
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


def run_git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )


def needs_git_action() -> bool:
    status = run_git("status", "--porcelain")
    if status.stdout.strip():
        return True
    branch = run_git("rev-parse", "--abbrev-ref", "HEAD")
    if branch.returncode != 0:
        return False
    head = branch.stdout.strip()
    if not head or head == "HEAD":
        return False
    proc = run_git("rev-list", "--count", f"origin/{head}..HEAD")
    if proc.returncode != 0:
        return False
    text = proc.stdout.strip()
    return bool(text.isdigit() and int(text) > 0)


def auto_deploy_enabled() -> bool:
    value = os.environ.get("GIT_AUTO_PUSH_DEPLOY", "1").strip().lower()
    return value not in ("0", "false", "no", "off")


def quick_commit_command() -> list[str]:
    cmd = [sys.executable, str(QUICK_COMMIT)]
    if auto_deploy_enabled():
        cmd.extend(["--deploy", "--deploy-optional"])
    return cmd


def auto_commit_push() -> bool:
    if not QUICK_COMMIT.is_file():
        log(f"未找到 {QUICK_COMMIT.name}，跳过")
        return False
    proc = subprocess.run(
        quick_commit_command(),
        cwd=ROOT,
        text=True,
    )
    return proc.returncode == 0


def main() -> int:
    newest = latest_worktree_mtime()
    last_activity = load_last_activity()
    if last_activity <= 0:
        last_activity = newest if newest > 0 else time.time()
    if newest > last_activity:
        last_activity = newest
        save_last_activity(last_activity)
        log("检测到文件改动，重置空闲计时")
        return 0

    idle_for = time.time() - last_activity
    if idle_for < IDLE_SECONDS:
        return 0
    if not needs_git_action():
        save_last_activity(time.time())
        return 0

    log(f"已空闲 {int(idle_for // 60)} 分钟，开始自动 commit + push"
        f"{' + deploy' if auto_deploy_enabled() else ''} …")
    if auto_commit_push():
        log("自动提交并推送完成" + ("（已尝试部署）" if auto_deploy_enabled() else ""))
        save_last_activity(time.time())
    else:
        log("自动推送失败，稍后重试")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
