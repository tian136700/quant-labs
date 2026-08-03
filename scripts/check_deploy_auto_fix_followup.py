#!/usr/bin/env python3
"""Regression: deploy failure → wait log → followup fix loop must stay wired."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOKS_JSON = ROOT / ".cursor" / "hooks.json"
FEATURE_HOOK = ROOT / ".cursor" / "hooks" / "feature-remark-stop.py"
FIX_HOOK = ROOT / ".cursor" / "hooks" / "deploy-auto-fix-stop.py"
WAIT = ROOT / "scripts" / "wait_deploy_result.py"
RULE = ROOT / ".cursor" / "rules" / "deploy-auto-fix-followup.mdc"


def fail(msg: str) -> int:
    print(f"[check_deploy_auto_fix_followup] FAIL: {msg}", file=sys.stderr)
    return 1


def main() -> int:
    for path in (FEATURE_HOOK, FIX_HOOK, WAIT, RULE, HOOKS_JSON):
        if not path.is_file():
            return fail(f"missing {path.relative_to(ROOT)}")

    hooks = HOOKS_JSON.read_text(encoding="utf-8")
    if "deploy-auto-fix-stop.py" not in hooks:
        return fail("hooks.json stop must include deploy-auto-fix-stop.py")
    if "loop_limit" not in hooks:
        return fail("deploy-auto-fix-stop must set loop_limit in hooks.json")

    feature = FEATURE_HOOK.read_text(encoding="utf-8")
    if "pending_deploy_followup" not in feature:
        return fail("feature-remark-stop must write pending_deploy_followup")
    if "file=sys.stderr" not in feature:
        return fail("feature-remark status prints must go to stderr (keep stdout clean)")

    fix = FIX_HOOK.read_text(encoding="utf-8")
    if "followup_message" not in fix:
        return fail("deploy-auto-fix-stop must emit followup_message on failure path")
    if "last_deploy_failure.txt" not in fix:
        return fail("deploy-auto-fix-stop must mention last_deploy_failure.txt")
    if "MAX_ATTEMPTS" not in fix and "max_attempts" not in fix.lower():
        return fail("deploy-auto-fix-stop must cap attempts")
    # 等待阶段禁止 followup，否则会打断用户正在 Plan 的对话
    if "_spawn_background_wait" not in fix and "Popen" not in fix:
        return fail("deploy-auto-fix-stop must background-spawn wait_deploy (no wait followup)")
    if "FOLLOWUP_WAIT" in fix:
        return fail("deploy-auto-fix-stop must not define FOLLOWUP_WAIT (interrupts Plan)")
    if "避免打断 Plan" not in fix and "不发 followup" not in fix:
        return fail("deploy-auto-fix-stop must document skipping wait followup for Plan")
    if "conversation_id" not in fix:
        return fail("deploy-auto-fix-stop must scope failure followup by conversation_id")

    if "conversation_id" not in feature:
        return fail("feature-remark-stop must store conversation_id in pending")

    wait = WAIT.read_text(encoding="utf-8")
    if "/api/deploy-logs" not in wait:
        return fail("wait_deploy_result must poll /api/deploy-logs")
    if "last_deploy_failure.txt" not in wait:
        return fail("wait_deploy_result must write last_deploy_failure.txt")
    if "pending_deploy_followup" not in wait:
        return fail("wait_deploy_result must clear pending on success")

    if "notify_deploy_autofix" not in fix and "正在修复" not in fix:
        return fail("deploy-auto-fix-stop must Bark 正在修复 on failure path")

    rule = RULE.read_text(encoding="utf-8")
    if "禁止" not in rule or "followup" not in rule:
        return fail("deploy-auto-fix-followup.mdc must forbid wait followup interrupting Plan")
    if "后台" not in rule and "spawn" not in rule:
        return fail("rule must describe background wait")

    bark = (ROOT / "scripts" / "maintenance_center" / "bark_notify.py").read_text(
        encoding="utf-8"
    )
    if "def notify_deploy_autofix" not in bark:
        return fail("bark_notify must define notify_deploy_autofix")
    if 'title = "正在修复"' not in bark:
        return fail("bark_notify autofix title must be 正在修复")
    if 'title = "成功"' not in bark or 'title = "失败"' not in bark:
        return fail("success/failure Bark titles must stay 成功/失败")

    # feature-remark 应在 loc-split 之前、deploy-auto-fix 之前；fix hook 在 feature 之后
    stop_block = re.search(r'"stop"\s*:\s*\[(.*?)\]', hooks, re.S)
    if not stop_block:
        return fail("hooks.json missing stop array")
    block = stop_block.group(1)
    i_feat = block.find("feature-remark-stop.py")
    i_fix = block.find("deploy-auto-fix-stop.py")
    if i_feat < 0 or i_fix < 0 or i_fix < i_feat:
        return fail("deploy-auto-fix-stop must run after feature-remark-stop")

    print("[check_deploy_auto_fix_followup] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
