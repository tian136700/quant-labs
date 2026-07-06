#!/usr/bin/env python3
"""Remove stale Cloudflare build output before deploy.

If local dev is listening on 3002, leave it running and skip .next cleanup
so you can keep verifying locally after publish.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEV_PORT = 3002


def dev_server_running(port: int = DEV_PORT) -> bool:
    try:
        out = subprocess.check_output(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False
    return any(line.strip().isdigit() for line in out.splitlines())


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


def main() -> int:
    local_dev = dev_server_running()

    if local_dev:
        print(
            f"本地 dev 正在运行 (:{DEV_PORT})，保留 .next/，仅清理 .open-next/",
            flush=True,
        )
        remove_build_dir(ROOT / ".open-next")
    else:
        for name in (".next", ".open-next"):
            remove_build_dir(ROOT / name)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError as exc:
        print(f"predeploy 清理失败: {exc}", file=sys.stderr)
        print(
            "若 .next 被占用，可暂时停止本地 dev 后重试 npm run deploy",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc
