from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEV_PORT = 3002
NPM = "npm.cmd" if os.name == "nt" else "npm"


def port_in_use(port: int) -> str | None:
    """若端口被占用，返回 lsof 中的 PID 描述；否则返回 None。"""
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    lines = [ln for ln in out.strip().splitlines() if ln and not ln.startswith("COMMAND")]
    if not lines:
        return None
    first = lines[0].split()
    if len(first) >= 2:
        return f"{first[0]} (PID {first[1]})"
    return lines[0]


def ensure_deps() -> None:
    if (ROOT / "node_modules").is_dir():
        return
    print("[dev] node_modules not found, running npm install…", flush=True)
    subprocess.run(
        [NPM, "install"],
        cwd=ROOT,
        check=True,
        shell=(os.name == "nt"),
    )


def start_dev() -> subprocess.Popen:
    return subprocess.Popen(
        [NPM, "run", "dev"],
        cwd=ROOT,
        env=os.environ.copy(),
        shell=(os.name == "nt"),
    )


def run_dev_server() -> None:
    """启动 Next.js 开发服务器；崩溃时自动拉起；改代码由 Next 热更新。"""
    ensure_deps()

    proc: subprocess.Popen | None = None
    stopping = False

    def shutdown(*_: object) -> None:
        nonlocal stopping, proc
        stopping = True
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    occupant = port_in_use(DEV_PORT)
    if occupant:
        print(f"[dev] 端口 {DEV_PORT} 已被占用：{occupant}", flush=True)
        print(
            f"[dev] 请先结束旧进程，例如：kill $(lsof -t -iTCP:{DEV_PORT} -sTCP:LISTEN)",
            flush=True,
        )
        sys.exit(1)

    print(f"[dev] http://127.0.0.1:{DEV_PORT}", flush=True)
    print("[dev] 保存代码后自动热更新（Next.js dev）", flush=True)
    print("[dev] Ctrl+C 停止", flush=True)

    try:
        while not stopping:
            proc = start_dev()
            rc = proc.wait()
            if stopping or rc in (0, -2, 130, -15):
                break
            print(f"[dev] 进程退出 (code {rc})，1.5s 后自动重启…", flush=True)
            time.sleep(1.5)
    finally:
        shutdown()

    sys.exit(0)
