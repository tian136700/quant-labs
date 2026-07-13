#!/usr/bin/env python3
"""
一键切换全站维护模式。

用法：
1. 打开这个文件，修改下面的 MODE：
   - MODE = "0"  -> 进入维护模式（所有页面/API 都只返回维护文字）
   - MODE = "1"  -> 恢复正常模式
2. 保存后执行：
   python3 website_maintenance_toggle.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


# 在这里改：
# "0" = 维护模式
# "1" = 正常模式
MODE = "0"


def main() -> int:
    if MODE not in {"0", "1"}:
        print('MODE 只能是 "0" 或 "1"', file=sys.stderr)
        return 2

    repo_root = Path(__file__).resolve().parent
    wrangler_file = repo_root / "wrangler.toml"
    if not wrangler_file.is_file():
        print(f"未找到 wrangler.toml：{wrangler_file}", file=sys.stderr)
        return 2

    print(f"切换 MAINTENANCE_MODE = {MODE}")
    print("0 = 维护模式，1 = 正常模式")

    cmd = [
        "npx",
        "wrangler",
        "deploy",
        "--keep-vars",
        "--var",
        f"MAINTENANCE_MODE:{MODE}",
    ]
    print("执行命令：", " ".join(cmd))

    result = subprocess.run(cmd, cwd=str(repo_root))
    if result.returncode == 0:
        if MODE == "0":
            print("已发布：全站进入维护模式。")
        else:
            print("已发布：全站恢复正常模式。")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
