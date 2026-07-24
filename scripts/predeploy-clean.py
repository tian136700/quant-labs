#!/usr/bin/env python3
"""Remove stale Cloudflare build output before deploy.

Production deploy clears `.next/` and `.open-next/` by default so dev cache cannot
inflate the Worker bundle or conflict with `next build`. If local dev is listening
on 3002, it is stopped first (SIGTERM) because it locks the same `.next/` directory.

Pass `--clean-next` for the same full clean (also used when dev was running).
Set `PRESERVE_NEXT_CACHE=1` only when no dev server is running to reuse `.next/`
and speed up repeated deploys.
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEV_PORT = 3002


def dev_server_pids(port: int = DEV_PORT) -> list[int]:
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []
    return [int(line.strip()) for line in out.splitlines() if line.strip().isdigit()]


def stop_dev_server(port: int = DEV_PORT) -> bool:
    pids = dev_server_pids(port)
    if not pids:
        return False
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            continue
    # brief grace for next dev to release .next file handles
    deadline = time.monotonic() + 3.0
    while time.monotonic() < deadline:
        if not dev_server_pids(port):
            break
        time.sleep(0.2)
    print(
        f"已停止本地 dev (:{port})，避免与 production build 争用 .next/",
        flush=True,
    )
    print("部署完成后可运行 npm run dev 恢复本地开发", flush=True)
    return True


def remove_build_dir(path: Path, attempts: int = 5) -> None:
    if not path.exists():
        return

    last_error: OSError | None = None
    for attempt in range(attempts):
        try:
            shutil.rmtree(path)
            print(f"已删除 {path.name}/")
            return
        except OSError as exc:
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(0.4 * (attempt + 1))

    if last_error is not None:
        raise last_error


def should_preserve_next_cache() -> bool:
    value = os.environ.get("PRESERVE_NEXT_CACHE", "0").strip().lower()
    return value in ("1", "true", "yes", "on")


def run_css_comment_guard() -> int:
    """Fail fast before next build if CSS comments are unbalanced (e.g. lone /**)."""
    script = ROOT / "scripts" / "check_css_comment_balance.py"
    if not script.is_file():
        return 0
    print("predeploy: 检查 CSS 注释闭合…", flush=True)
    return subprocess.call([sys.executable, str(script)], cwd=str(ROOT))


def main() -> int:
    clean_next = "--clean-next" in sys.argv[1:]
    local_dev = bool(dev_server_pids())

    css_rc = run_css_comment_guard()
    if css_rc != 0:
        print(
            "predeploy 中止：请先修好未闭合的 CSS 注释（见 scripts/check_css_comment_balance.py）",
            file=sys.stderr,
            flush=True,
        )
        return css_rc

    if local_dev:
        stop_dev_server()

    preserve_next = should_preserve_next_cache() and not clean_next and not local_dev
    if preserve_next:
        print("保留 .next/ 缓存，仅清理 .open-next/ 以加速重复部署", flush=True)
        remove_build_dir(ROOT / ".open-next")
    else:
        print("执行干净构建：清理 .next/ 和 .open-next/", flush=True)
        for name in (".next", ".open-next"):
            remove_build_dir(ROOT / name)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError as exc:
        print(f"predeploy 清理失败: {exc}", file=sys.stderr)
        print(
            "若 .next 仍被占用，可手动停止占用进程后重试 npm run deploy",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc
