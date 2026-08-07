#!/usr/bin/env python3
"""本地打开老师端抽查卡预览（免登录 debug 页；数据优先本地，缺则线上回退）。

用法：
  python3 scripts/open_jp_vocab_card_preview.py
  python3 scripts/open_jp_vocab_card_preview.py --word-id 571
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE = "http://127.0.0.1:3002"
sys.path.insert(0, str(ROOT / "scripts" / "lib"))
from open_preview_browser import open_preview_url  # noqa: E402


def wait_ready(base: str, timeout_sec: float = 90.0) -> bool:
    deadline = time.time() + timeout_sec
    url = f"{base.rstrip('/')}/api/app-deploy-version"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if 200 <= resp.status < 500:
                    return True
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        time.sleep(1.0)
    return False


def ensure_dev_server() -> None:
    try:
        with urllib.request.urlopen(
            f"{DEFAULT_BASE}/api/app-deploy-version", timeout=2
        ):
            return
    except (urllib.error.URLError, TimeoutError, OSError):
        pass
    print("[open-preview] 3002 未监听，启动 python3 start.py …", flush=True)
    subprocess.Popen(
        [sys.executable, "start.py"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--word-id", type=int, default=571)
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()
    word_id = args.word_id if args.word_id > 0 else 571
    base = str(args.base).rstrip("/")

    ensure_dev_server()
    if not wait_ready(base):
        print(f"[open-preview] 等待 {base} 超时", file=sys.stderr)
        return 1

    url = f"{base}/debug-jp-vocab-card-571?word_id={word_id}"
    print(f"[open-preview] {url}", flush=True)
    if not args.no_open:
        open_preview_url(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
