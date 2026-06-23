#!/usr/bin/env python3
"""Stop local dev on 3002 and remove .next / .open-next before deploy."""

from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KILL_PORT = ROOT / "kill-port.py"
BUILD_DIRS = (".next", ".open-next")


def kill_dev_server(port: int = 3002) -> None:
    if not KILL_PORT.is_file():
        return
    subprocess.run(
        [sys.executable, str(KILL_PORT), str(port)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.4)
    subprocess.run(
        [sys.executable, str(KILL_PORT), str(port), "-f"],
        check=False,
    )


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
    kill_dev_server()
    time.sleep(0.6)

    for name in BUILD_DIRS:
        remove_build_dir(ROOT / name)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError as exc:
        print(f"predeploy 清理失败: {exc}", file=sys.stderr)
        print("请确认 3002 端口无进程占用后重试 npm run deploy", file=sys.stderr)
        raise SystemExit(1) from exc
