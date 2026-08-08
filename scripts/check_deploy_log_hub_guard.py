#!/usr/bin/env python3
"""回归：维护中心 DEPLOY_LOG_ID 路径下，git-quick-commit 不得 finish_deploy_log 覆盖 hub 日志。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUICK_COMMIT = ROOT / "git-quick-commit.py"

text = QUICK_COMMIT.read_text(encoding="utf-8")
errors: list[str] = []

if "hub_managed_log" not in text:
    errors.append("缺少 hub_managed_log 变量")
if "not hub_managed_log" not in text:
    errors.append("finally 须跳过 hub 托管的 finish_deploy_log")
if "append_deploy_log_details" not in text:
    errors.append("缺少说明注释（append_deploy_log_details 被覆盖）")
if "ensure_on_deploy_branch" not in text:
    errors.append("缺少 detached HEAD 自动切回 main（ensure_on_deploy_branch）")
if "is_detached_head" not in text:
    errors.append("缺少 detached HEAD 检测（is_detached_head）")
if "is_next_document_collect_flake" not in text:
    errors.append("缺少 /_document Collecting page data 偶发失败检测")
if "run_live_tee" not in text:
    errors.append("缺少 run_live_tee（捕获输出以便识别 /_document flake）")
if "retried after /_document flake" not in text:
    errors.append("缺少 /_document flake 自动重试一次")

if errors:
    print("check_deploy_log_hub_guard FAILED:", file=sys.stderr)
    for err in errors:
        print(f"  - {err}", file=sys.stderr)
    sys.exit(1)

print("check_deploy_log_hub_guard OK")
