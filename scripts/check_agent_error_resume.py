#!/usr/bin/env python3
"""Regression: Agent 仅在 status=error 时自动续跑；aborted（用户 Stop）不续。"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOKS_JSON = ROOT / ".cursor" / "hooks.json"
HOOK = ROOT / ".cursor" / "hooks" / "agent-error-resume-stop.py"
RULE = ROOT / ".cursor" / "rules" / "agent-error-resume.mdc"
PENDING = ROOT / ".cursor" / "hooks" / ".state" / "pending_deploy_followup.json"


def fail(msg: str) -> int:
    print(f"[check_agent_error_resume] FAIL: {msg}", file=sys.stderr)
    return 1


def _run_hook(payload: dict, *, env_extra: dict[str, str] | None = None) -> dict:
    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        cwd=str(ROOT),
        env=env,
        timeout=10,
        check=False,
    )
    out = (proc.stdout or "").strip()
    if not out:
        return {}
    try:
        data = json.loads(out.splitlines()[-1])
    except json.JSONDecodeError:
        return {"_raw": out, "_stderr": proc.stderr, "_code": proc.returncode}
    return data if isinstance(data, dict) else {"_raw": out}


def main() -> int:
    for path in (HOOK, RULE, HOOKS_JSON):
        if not path.is_file():
            return fail(f"missing {path.relative_to(ROOT)}")

    hooks = HOOKS_JSON.read_text(encoding="utf-8")
    if "agent-error-resume-stop.py" not in hooks:
        return fail("hooks.json stop must include agent-error-resume-stop.py")

    stop_block = re.search(r'"stop"\s*:\s*\[(.*?)\]', hooks, re.S)
    if not stop_block:
        return fail("hooks.json missing stop array")
    block = stop_block.group(1)
    entry_m = re.search(
        r'\{[^{}]*agent-error-resume-stop\.py[^{}]*\}',
        block,
        re.S,
    )
    if not entry_m:
        return fail("cannot find agent-error-resume-stop entry in stop array")
    entry = entry_m.group(0)
    if "loop_limit" not in entry:
        return fail("agent-error-resume-stop must set loop_limit")
    to_m = re.search(r'"timeout"\s*:\s*(\d+)', entry)
    if not to_m or int(to_m.group(1)) < 75:
        return fail("agent-error-resume-stop timeout must be >= 75 (covers 60s 换账号窗口)")

    src = HOOK.read_text(encoding="utf-8")
    for needle in (
        'status == "aborted"',
        'status != "error"',
        "followup_message",
        "DEFAULT_DELAY_SEC = 60",
        "AGENT_ERROR_RESUME_DISABLED",
        "pending_deploy_followup",
        "换账号",
    ):
        if needle not in src:
            return fail(f"hook missing required logic: {needle}")

    rule = RULE.read_text(encoding="utf-8")
    if "Don't revert" not in rule and "不撤回" not in src:
        return fail("must document Don't revert / 不撤回")
    if "aborted" not in rule or "error" not in rule:
        return fail("rule must document aborted vs error")
    if "额度" not in rule and "换账号" not in rule:
        return fail("rule must document 额度/换账号 use case")

    pending_bak = PENDING.with_suffix(".json.checkbak")
    moved_pending = False
    try:
        if PENDING.is_file():
            PENDING.replace(pending_bak)
            moved_pending = True

        aborted = _run_hook(
            {"status": "aborted", "loop_count": 0, "hook_event_name": "stop"}
        )
        if aborted.get("followup_message"):
            return fail("aborted must NOT emit followup_message")

        completed = _run_hook(
            {"status": "completed", "loop_count": 0, "hook_event_name": "stop"}
        )
        if completed.get("followup_message"):
            return fail("completed must NOT emit followup_message")

        disabled = _run_hook(
            {"status": "error", "loop_count": 0, "hook_event_name": "stop"},
            env_extra={
                "AGENT_ERROR_RESUME_DISABLED": "1",
                "AGENT_ERROR_RESUME_DELAY_SEC": "0",
            },
        )
        if disabled.get("followup_message"):
            return fail("AGENT_ERROR_RESUME_DISABLED must suppress followup")

        errored = _run_hook(
            {"status": "error", "loop_count": 0, "hook_event_name": "stop"},
            env_extra={"AGENT_ERROR_RESUME_DELAY_SEC": "0"},
        )
        if not errored.get("followup_message"):
            return fail("status=error must emit followup_message")
        msg = str(errored.get("followup_message"))
        if "不撤回" not in msg and "保留" not in msg:
            return fail("followup must ask to keep existing changes")

        capped = _run_hook(
            {"status": "error", "loop_count": 2, "hook_event_name": "stop"},
            env_extra={"AGENT_ERROR_RESUME_DELAY_SEC": "0"},
        )
        if capped.get("followup_message"):
            return fail("loop_count >= MAX_LOOP must NOT emit followup")
    finally:
        if moved_pending and pending_bak.is_file():
            pending_bak.replace(PENDING)

    print("[check_agent_error_resume] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
