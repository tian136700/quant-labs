#!/usr/bin/env python3
"""Remove stale Cloudflare build output before deploy.

Default to preserving `.next/` so Next.js can reuse its build cache and speed up
repeated Cloudflare deploys. Pass `--clean-next` (or set `PRESERVE_NEXT_CACHE=0`)
when you explicitly need a fully clean rebuild.

If local dev is listening on 3002, leave it running and always skip `.next`
cleanup so you can keep verifying locally after publish.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import time
import os
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


def should_preserve_next_cache() -> bool:
    value = os.environ.get("PRESERVE_NEXT_CACHE", "1").strip().lower()
    return value not in ("0", "false", "no", "off")


def main() -> int:
    local_dev = dev_server_running()
    clean_next = "--clean-next" in sys.argv[1:]

    if local_dev:
        print(
            f"本地 dev 正在运行 (:{DEV_PORT})，保留 .next/，仅清理 .open-next/",
            flush=True,
        )
        remove_build_dir(ROOT / ".open-next")
    else:
        preserve_next = should_preserve_next_cache() and not clean_next
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
            "若 .next 被占用，可暂时停止本地 dev 后重试 npm run deploy",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc
