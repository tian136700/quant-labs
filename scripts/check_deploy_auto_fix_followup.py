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
    if "_run_prepublish_gates" not in feature:
        return fail("feature-remark-stop must run prepublish gates before POST")
    if "check_no_duplicate_hook_destructure" not in feature:
        return fail("feature-remark-stop must gate on hook destructure duplicates")

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
    if "ORPHAN_FOLLOWUP_SEC" not in fix and "_may_followup_fix" not in fix:
        return fail("deploy-auto-fix-stop must allow orphan followup after source session ends")
    if "_materialize_failure_from_mc" not in fix:
        return fail("deploy-auto-fix-stop must materialize failure from maintenance center")
    if "_mc_has_running_deploy" not in fix:
        return fail("deploy-auto-fix-stop must skip followup while a newer deploy is running")

    if "conversation_id" not in feature:
        return fail("feature-remark-stop must store conversation_id in pending")
    if "_spawn_wait_deploy" not in feature and "wait_deploy_result" not in feature:
        return fail("feature-remark-stop must spawn wait_deploy after enqueue (belt+suspenders)")

    session_hook = ROOT / ".cursor" / "hooks" / "deploy-auto-fix-session.py"
    if not session_hook.is_file():
        return fail("missing deploy-auto-fix-session.py")
    if "deploy-auto-fix-session.py" not in hooks:
        return fail("hooks.json sessionStart must include deploy-auto-fix-session.py")
    session = session_hook.read_text(encoding="utf-8")
    if "last_deploy_failure" not in session or "additional_context" not in session:
        return fail("deploy-auto-fix-session must inject failure context")
    if "回一句" not in session and "followup" not in session:
        return fail("deploy-auto-fix-session must tip reply-to-trigger autofix")
    if "Identifier" not in session and "Failed to compile" not in session:
        return fail("deploy-auto-fix-session must parse compile Identifier errors")

    wait = WAIT.read_text(encoding="utf-8")
    if "/api/deploy-logs" not in wait:
        return fail("wait_deploy_result must poll /api/deploy-logs")
    if "last_deploy_failure.txt" not in wait:
        return fail("wait_deploy_result must write last_deploy_failure.txt")
    if "pending_deploy_followup" not in wait:
        return fail("wait_deploy_result must clear pending on success")
    if "failed_awaiting_fix" not in wait:
        return fail("wait_deploy_result must mark pending phase failed_awaiting_fix on failure")
    if "is_deploy_transient_republish_failure" not in wait and "_try_auto_republish_transient" not in wait:
        return fail("wait_deploy_result must auto-republish transient /_document or CF failures")
    if "原对话回一句" not in wait and "触发自动修" not in wait:
        return fail("wait_deploy_result failure tip must mention reply-to-trigger autofix")
    if "--- tip ---" not in fix:
        return fail("deploy-auto-fix-stop materialize tip must include --- tip ---")

    if "notify_deploy_autofix" not in fix and "正在修复" not in fix:
        return fail("deploy-auto-fix-stop must Bark 正在修复 on failure path")
    if "_try_auto_republish_transient" not in fix and "FOLLOWUP_TRANSIENT" not in fix:
        return fail("deploy-auto-fix-stop must auto-republish transient failures before code fix")
    if "FOLLOWUP_HUB_RESTART" not in fix or "_try_dismiss_hub_restart_false_failure" not in fix:
        return fail("deploy-auto-fix-stop must dismiss maintenance-center restart false failures")
    if "_try_dismiss_stale_failure_superseded_by_success" not in fix:
        return fail(
            "deploy-auto-fix-stop must dismiss stale failure when a newer MC success exists"
        )
    if "deploy_autofix_gave_up" not in fix and "GAVE_UP_FILE" not in fix:
        return fail("deploy-auto-fix-stop must track gave_up after max autofix attempts")
    if "deploy_autofix_stale_failure" not in session:
        return fail("deploy-auto-fix-session must dismiss stale failure superseded by success")

    lib_stale = ROOT / "scripts" / "lib" / "deploy_autofix_stale_failure.py"
    if not lib_stale.is_file():
        return fail("missing scripts/lib/deploy_autofix_stale_failure.py")

    lib_doc = ROOT / "scripts" / "lib" / "next_document_deploy_retry.py"
    if not lib_doc.is_file():
        return fail("missing scripts/lib/next_document_deploy_retry.py")
    lib_txt = lib_doc.read_text(encoding="utf-8")
    if "is_next_document_collect_flake" not in lib_txt:
        return fail("next_document_deploy_retry must export is_next_document_collect_flake")
    if "is_next_nft_json_trace_flake" not in lib_txt:
        return fail("next_document_deploy_retry must export is_next_nft_json_trace_flake")
    if "is_next_build_cache_flake" not in lib_txt:
        return fail("next_document_deploy_retry must export is_next_build_cache_flake")

    lib_hub = ROOT / "scripts" / "lib" / "maintenance_center_restart_interrupt.py"
    if not lib_hub.is_file():
        return fail("missing scripts/lib/maintenance_center_restart_interrupt.py")
    lib_hub_txt = lib_hub.read_text(encoding="utf-8")
    if "is_maintenance_center_restart_interrupt" not in lib_hub_txt:
        return fail("restart interrupt lib must export is_maintenance_center_restart_interrupt")
    if "should_reconcile_stale_auto_running_row" not in lib_hub_txt:
        return fail("restart interrupt lib must export should_reconcile_stale_auto_running_row")

    server = (ROOT / "scripts" / "maintenance_center" / "server.py").read_text(encoding="utf-8")
    if "should_reconcile_stale_auto_running_row" not in server:
        return fail("server._reconcile_stale_auto_row must use should_reconcile_stale_auto_running_row")

    if "is_maintenance_center_restart_interrupt" not in wait:
        return fail("wait_deploy_result must skip finalizing hub-restart false errors")

    sys.path.insert(0, str(ROOT / "scripts"))
    from lib.next_document_deploy_retry import (  # noqa: WPS433
        is_deploy_transient_republish_failure,
        is_next_build_cache_flake,
        is_next_nft_json_trace_flake,
    )
    from lib.maintenance_center_restart_interrupt import (  # noqa: WPS433
        hub_restart_interrupt_is_details_only,
        is_maintenance_center_restart_interrupt,
        should_reconcile_stale_auto_running_row,
    )

    sample_nft = """
   Collecting build traces ...
[Error: ENOENT: no such file or directory, open '/Users/Admin/Documents/code/us_stock_monitor/strategy-compare-cloud/.next/server/app/api/admin/en-lesson-teacher-review/route.js.nft.json'] {
  errno: -2,
  code: 'ENOENT',
  syscall: 'open',
  path: '.../.next/server/app/api/admin/en-lesson-teacher-review/route.js.nft.json'
}
"""
    if not is_next_nft_json_trace_flake(sample_nft):
        return fail("nft.json ENOENT during traces must count as Next build-cache flake")
    if not is_next_build_cache_flake(sample_nft):
        return fail("is_next_build_cache_flake must include nft.json traces ENOENT")
    if not is_deploy_transient_republish_failure(sample_nft):
        return fail("wait/stop must auto-republish nft.json traces ENOENT")
    if is_next_nft_json_trace_flake("Type error: Property 'x' does not exist"):
        return fail("nft.json detector must not match TypeScript errors")

    sample_wrangler_auth = (
        "In a non-interactive environment, it's necessary to set a "
        "CLOUDFLARE_API_TOKEN environment variable for wrangler to work."
    )
    if is_deploy_transient_republish_failure(sample_wrangler_auth):
        return fail("expired wrangler login / missing token must not auto-republish")

    sample_hub_restart = (
        "任务中断（维护中心已重启，下方为已保存的日志）\n"
        "started_at: 2026-08-15 15:47:00\n"
        "summary: auto任务开始：部署\n"
        "remark: auto idle deploy\n"
    )
    if not is_maintenance_center_restart_interrupt(sample_hub_restart):
        return fail("hub restart interrupt must be detected")
    if not hub_restart_interrupt_is_details_only(sample_hub_restart, sample_hub_restart):
        return fail("hub restart short details must count as details-only false failure")
    if should_reconcile_stale_auto_running_row(
        {
            "status": "running",
            "started_at": "2026-08-15 15:47:00",
            "trigger_source": "git-auto-push-once",
        },
        hub_has_active_auto_job=False,
        deploy_lock_held=False,
        now=__import__("datetime").datetime(2026, 8, 15, 15, 50, 0),
    ):
        return fail("fresh auto idle deploy must NOT be reconciled as hub-restart failure")

    rule = RULE.read_text(encoding="utf-8")
    if "禁止" not in rule or "followup" not in rule:
        return fail("deploy-auto-fix-followup.mdc must forbid wait followup interrupting Plan")
    if "后台" not in rule and "spawn" not in rule:
        return fail("rule must describe background wait")
    if "orphan" not in rule.lower() and "90" not in rule:
        return fail("rule must document orphan followup")
    if "deploy-auto-fix-session" not in rule:
        return fail("rule must mention sessionStart deploy-auto-fix-session")
    if "nft.json" not in rule:
        return fail("rule must document Collecting build traces nft.json ENOENT flake")
    if "维护中心已重启" not in rule:
        return fail("rule must document hub-restart false failure (local, not Cloudflare)")
    if "旧失败" not in rule and "成功盖掉" not in rule:
        return fail("rule must document dismissing stale failure superseded by newer success")

    from lib.deploy_autofix_stale_failure import (  # noqa: WPS433
        newer_deploy_success_exists,
        parse_deploy_failure_log_id,
        should_skip_followup_for_gave_up,
    )

    if parse_deploy_failure_log_id("deploy_log_id=2438\nstatus=error\n") != 2438:
        return fail("parse_deploy_failure_log_id must read deploy_log_id")
    if not newer_deploy_success_exists(
        [{"id": 2503, "status": "success", "exit_code": 0}],
        failure_log_id=2438,
    ):
        return fail("newer success id must supersede older failure")
    if newer_deploy_success_exists(
        [{"id": 2437, "status": "success", "exit_code": 0}],
        failure_log_id=2438,
    ):
        return fail("older success must NOT supersede newer failure id")
    if newer_deploy_success_exists(
        [{"id": 2504, "status": "running"}],
        failure_log_id=2438,
    ):
        return fail("running deploy must NOT count as success supersede")

    import tempfile
    from pathlib import Path as _P

    with tempfile.TemporaryDirectory() as td:
        gave = _P(td) / "gave_up.json"
        gave.write_text('{"deploy_log_id": 2438}\n', encoding="utf-8")
        if not should_skip_followup_for_gave_up(
            gave_up_file=gave, failure_log_id=2438
        ):
            return fail("gave_up same log_id must skip followup")
        if should_skip_followup_for_gave_up(
            gave_up_file=gave, failure_log_id=2500
        ):
            return fail("gave_up must not skip a different newer failure log_id")

    bark = (ROOT / "scripts" / "maintenance_center" / "bark_notify.py").read_text(
        encoding="utf-8"
    )
    if "def notify_deploy_autofix" not in bark:
        return fail("bark_notify must define notify_deploy_autofix")
    if 'title = "正在修复"' not in bark:
        return fail("bark_notify autofix title must be 正在修复")
    if 'title = "成功"' not in bark or 'title = "失败"' not in bark:
        return fail("success/failure Bark titles must stay 成功/失败")
    if "下一步：在 Cursor 原对话回一句即可触发自动修" not in bark:
        return fail("failure Bark body must tip reply-to-trigger autofix")

    rule_dup = ROOT / ".cursor" / "rules" / "hook-destructure-no-dup.mdc"
    if not rule_dup.is_file():
        return fail("missing hook-destructure-no-dup.mdc")
    predeploy = (ROOT / "scripts" / "predeploy-clean.py").read_text(encoding="utf-8")
    if "run_hook_destructure_guard" not in predeploy:
        return fail("predeploy-clean must run hook destructure guard")
    if "构建级错误" not in rule and "预发门禁" not in rule:
        return fail("deploy-auto-fix-followup.mdc must document prepublish compile gates")

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
