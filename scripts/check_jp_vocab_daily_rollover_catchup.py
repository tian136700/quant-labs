#!/usr/bin/env python3
"""回归：日语跨日清理必须有独立 launchd + 漏跑补跑（开机 RunAtLoad）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    nightly = read("scripts/jp-vocab-daily-rollover-nightly.sh")
    if "already_done_beijing_today" not in nightly:
        errors.append("jp-vocab-daily-rollover-nightly.sh 缺少同北京日 skip")
    if 'STATE_FILE="${CONFIG_DIR}/jp-vocab-daily-rollover.last_success"' not in nightly:
        errors.append("须写 jp-vocab-daily-rollover.last_success")
    if "jp-vocab-daily-rollover-api.py" not in nightly:
        errors.append("须调用 jp-vocab-daily-rollover-api.py")

    plist = read("scripts/com.infoquests.jp-vocab-daily-rollover.plist.example")
    if "<key>RunAtLoad</key>" not in plist or "<true/>" not in plist:
        errors.append("plist.example 必须 RunAtLoad=true（开机补跑）")
    if "jp-vocab-daily-rollover-nightly.sh" not in plist:
        errors.append("plist 须指向 jp-vocab-daily-rollover-nightly.sh")

    fill = read("scripts/jp-vocab-fill-reading-nightly.sh")
    if "daily-rollover" in fill and "不要顺带跑" not in fill.splitlines()[1]:
        # 允许注释说明不要顺带跑
        pass
    if "jp-vocab-daily-rollover-api.py" in fill:
        errors.append("fill-reading-nightly 禁止再直接调 daily-rollover-api（应独立 launchd）")

    setup_fill = read("scripts/setup-jp-vocab-fill-reading-mac.sh")
    if "setup-jp-vocab-daily-rollover-mac.sh" not in setup_fill:
        errors.append("setup-jp-vocab-fill-reading-mac.sh 须联装 daily-rollover")

    setup_roll = read("scripts/setup-jp-vocab-daily-rollover-mac.sh")
    if "com.infoquests.jp-vocab-daily-rollover" not in setup_roll:
        errors.append("setup-jp-vocab-daily-rollover-mac.sh 标签错误")

    registry = read("scripts/maintenance_center/cron_tasks/registry.py")
    if 'id="jp-vocab-daily-rollover"' not in registry:
        errors.append("维护中心 registry 须登记 jp-vocab-daily-rollover")

    progress = read("src/lib/jp-vocab-daily-quiz-progress.ts")
    if not re.search(r"JP_VOCAB_DAILY_QUIZ_TOP\s*=\s*20", progress):
        errors.append("JP_VOCAB_DAILY_QUIZ_TOP 须为 20（跨日重置默认）")

    if errors:
        print("check_jp_vocab_daily_rollover_catchup: FAIL", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("check_jp_vocab_daily_rollover_catchup: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
