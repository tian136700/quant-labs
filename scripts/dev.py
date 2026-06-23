from __future__ import annotations

import argparse
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


def has_build() -> bool:
    return (ROOT / ".next" / "BUILD_ID").is_file()


def run_build() -> None:
    print("[dev] 正在构建（npm run build）…", flush=True)
    subprocess.run(
        [NPM, "run", "build"],
        cwd=ROOT,
        check=True,
        shell=(os.name == "nt"),
    )


def start_hot_dev() -> subprocess.Popen:
    return subprocess.Popen(
        [NPM, "run", "dev"],
        cwd=ROOT,
        env=os.environ.copy(),
        shell=(os.name == "nt"),
    )


def start_stable_server() -> subprocess.Popen:
    return subprocess.Popen(
        [NPM, "run", "start:local"],
        cwd=ROOT,
        env=os.environ.copy(),
        shell=(os.name == "nt"),
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="本地启动 strategy-compare-cloud")
    parser.add_argument(
        "--hot",
        action="store_true",
        help="启用 Next.js dev 热更新（默认关闭，改代码不会触发重启）",
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="稳定模式下强制重新 build 后再启动",
    )
    return parser.parse_args(argv)


def run_dev_server(argv: list[str] | None = None) -> None:
    """默认稳定模式：next build + next start，不监听文件、不自动重启。"""
    args = parse_args(argv)
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
    if args.hot:
        print("[dev] 热更新模式（Next.js dev）", flush=True)
    else:
        print("[dev] 稳定模式：不热更新，保存代码不会触发重启", flush=True)
        if args.rebuild or not has_build():
            run_build()
        else:
            print("[dev] 使用已有 .next 构建；改代码后请 Ctrl+C 重启并加 --rebuild", flush=True)
    print("[dev] Ctrl+C 停止", flush=True)

    try:
        if args.hot:
            while not stopping:
                proc = start_hot_dev()
                rc = proc.wait()
                if stopping or rc in (0, -2, 130, -15):
                    break
                print(f"[dev] 进程退出 (code {rc})，1.5s 后自动重启…", flush=True)
                time.sleep(1.5)
        else:
            proc = start_stable_server()
            rc = proc.wait()
            if not stopping and rc not in (0, -2, 130, -15):
                print(f"[dev] 进程异常退出 (code {rc})", flush=True)
                sys.exit(rc if rc is not None else 1)
    finally:
        shutdown()

    sys.exit(0)
