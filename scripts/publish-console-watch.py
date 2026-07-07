#!/usr/bin/env python3
"""发布控制台热更新守护：监听脚本变更，自动重启 HTTP 服务。"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
CONSOLE = SCRIPTS / "publish-console.py"
LOCK_FILE = ROOT / ".publish-console.job.lock"

WATCH_FILES = (
    CONSOLE,
    SCRIPTS / "git_commit_message.py",
)

POLL_SECONDS = 1.0
STOP_TIMEOUT_SECONDS = 8.0


def _signatures() -> dict[Path, float]:
    out: dict[Path, float] = {}
    for path in WATCH_FILES:
        if path.is_file():
            out[path] = path.stat().st_mtime
    return out


def _stop(child: subprocess.Popen[bytes] | None) -> None:
    if child is None or child.poll() is not None:
        return
    child.terminate()
    try:
        child.wait(timeout=STOP_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
    print("[publish-console-watch] 已停止旧进程", flush=True)


def main() -> int:
    if not CONSOLE.is_file():
        print(f"未找到 {CONSOLE}", file=sys.stderr)
        return 1

    child: subprocess.Popen[bytes] | None = None
    known = _signatures()
    pending_reload = False

    print("[publish-console-watch] 热更新已启用", flush=True)
    print(f"[publish-console-watch] 监听: {', '.join(p.name for p in WATCH_FILES)}", flush=True)

    try:
        while True:
            current = _signatures()
            if child is not None and child.poll() is None:
                for path, mtime in current.items():
                    if known.get(path) != mtime:
                        pending_reload = True
                        print(f"[publish-console-watch] 检测到变更: {path.name}", flush=True)
                        break
                known = current

            need_start = child is None or child.poll() is not None
            if pending_reload and child is not None and child.poll() is None:
                if LOCK_FILE.is_file():
                    print("[publish-console-watch] 发布进行中，暂缓热更新…", flush=True)
                else:
                    need_start = True

            if need_start:
                _stop(child)
                pending_reload = False
                known = _signatures()
                print("[publish-console-watch] 启动发布控制台…", flush=True)
                child = subprocess.Popen([sys.executable, str(CONSOLE)])

            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\n[publish-console-watch] 已停止", flush=True)
        _stop(child)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
