#!/usr/bin/env python3
"""回归：Worker 1027 门禁须缓存约 10 分钟，且主要 fill 入口已接线。"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUARD = ROOT / "scripts" / "lib" / "worker_api_guard.py"

MUST_CALL_SKIP = [
    ROOT / "scripts" / "jp-vocab-fill-meaning-api.py",
    ROOT / "scripts" / "jp-vocab-fill-grammar-usage-examples-api.py",
    ROOT / "scripts" / "jp-vocab-fill-reading-api.py",
    ROOT / "scripts" / "jp-vocab-fill-example-sentences-api.py",
    ROOT / "scripts" / "en-vocab-fill-online-batch-api.py",
    ROOT / "scripts" / "en-vocab-fill-reading-api.py",
    ROOT / "scripts" / "en-vocab-fill-meaning-api.py",
    ROOT / "scripts" / "en-vocab-fill-usage-api.py",
    ROOT / "scripts" / "en-vocab-fill-example-sentences-api.py",
]


def main() -> int:
    guard_src = GUARD.read_text(encoding="utf-8")
    if "_NEGATIVE_CACHE_SEC = 600" not in guard_src:
        print("FAIL: worker_api_guard 负缓存须为 600 秒（10 分钟）", file=sys.stderr)
        return 1
    if "def skip_if_worker_unavailable" not in guard_src:
        print("FAIL: 缺少 skip_if_worker_unavailable", file=sys.stderr)
        return 1
    if "def record_worker_unavailable" not in guard_src:
        print("FAIL: 缺少 record_worker_unavailable", file=sys.stderr)
        return 1
    # 禁止裸匹配任意 1027 数字（易误判）
    if '"1027"' in guard_src and '"error 1027"' not in guard_src:
        print("FAIL: 1027 提示须带 error/code 上下文", file=sys.stderr)
        return 1

    for path in MUST_CALL_SKIP:
        text = path.read_text(encoding="utf-8")
        if "skip_if_worker_unavailable" not in text:
            print(f"FAIL: {path.name} 未接 skip_if_worker_unavailable", file=sys.stderr)
            return 1
        # 语法可解析
        ast.parse(text)

    print("ok: worker 1027 guard wired + 10min cache")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
