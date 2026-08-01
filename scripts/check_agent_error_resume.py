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
CANCEL_HOOK = ROOT / ".cursor" / "hooks" / "agent-error-resume-cancel-prompt.py"
RULE = ROOT / ".cursor" / "rules" / "agent-error-resume.mdc"
STATE_DIR = ROOT / ".cursor" / "hooks" / ".state"
PENDING = STATE_DIR / "pending_deploy_followup.json"
CANCEL_RESUME = STATE_DIR / "cancel_agent_error_resume.json"
PENDING_RESUME = STATE_DIR / "pending_agent_error_resume.json"


def fail(msg: str) -> int:
    print(f"[check_agent_error_resume] FAIL: {msg}", file=sys.stderr)
    return 1


def _run_hook(
    payload: dict,
    *,
    env_extra: dict[str, str] | None = None,
    timeout: int = 15,
) -> dict:
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
        timeout=timeout,
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
    for path in (HOOK, CANCEL_HOOK, RULE, HOOKS_JSON):
        if not path.is_file():
            return fail(f"missing {path.relative_to(ROOT)}")

    hooks = HOOKS_JSON.read_text(encoding="utf-8")
    if "agent-error-resume-stop.py" not in hooks:
        return fail("hooks.json stop must include agent-error-resume-stop.py")
    if "beforeSubmitPrompt" not in hooks or "agent-error-resume-cancel-prompt.py" not in hooks:
        return fail("hooks.json must wire beforeSubmitPrompt cancel hook")

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
        "pending_agent_error_resume",
        "cancel_agent_error_resume",
        "_sleep_until_resume_or_cancel",
    ):
        if needle not in src:
            return fail(f"hook missing required logic: {needle}")

    if "cancel_agent_error_resume" not in CANCEL_HOOK.read_text(encoding="utf-8"):
        return fail("cancel hook must write cancel_agent_error_resume")

    rule = RULE.read_text(encoding="utf-8")
    if "Don't revert" not in rule and "不撤回" not in src:
        return fail("must document Don't revert / 不撤回")
    if "aborted" not in rule or "error" not in rule:
        return fail("rule must document aborted vs error")
    if "额度" not in rule and "换账号" not in rule:
        return fail("rule must document 额度/换账号 use case")
    if "手动" not in rule or "取消" not in rule:
        return fail("rule must document cancel when user manually continues")

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

        # sleep 中途写 cancel → 不 followup（用户手动续跑）
        import threading
        import time as _time

        CANCEL_RESUME.unlink(missing_ok=True)
        PENDING_RESUME.unlink(missing_ok=True)

        def _write_cancel_soon() -> None:
            _time.sleep(0.4)
            try:
                STATE_DIR.mkdir(parents=True, exist_ok=True)
                CANCEL_RESUME.write_text(
                    json.dumps({"reason": "test_mid_sleep"}, ensure_ascii=False)
                    + "\n",
                    encoding="utf-8",
                )
            except OSError:
                pass

        thr = threading.Thread(target=_write_cancel_soon, daemon=True)
        thr.start()
        mid = _run_hook(
            {
                "status": "error",
                "loop_count": 0,
                "generation_id": "gen-mid-1",
                "conversation_id": "conv-mid",
                "hook_event_name": "stop",
            },
            env_extra={"AGENT_ERROR_RESUME_DELAY_SEC": "2"},
            timeout=15,
        )
        thr.join(timeout=3)
        if mid.get("followup_message"):
            return fail("cancel during delay must NOT emit followup_message")
        CANCEL_RESUME.unlink(missing_ok=True)
        PENDING_RESUME.unlink(missing_ok=True)
    finally:
        if moved_pending and pending_bak.is_file():
            pending_bak.replace(PENDING)

    print("[check_agent_error_resume] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
