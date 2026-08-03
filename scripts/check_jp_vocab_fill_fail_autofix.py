#!/usr/bin/env python3
"""回归：日语补全失败自动修（空闲门禁 + SDK 入队）。"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


def main() -> None:
    autofix = (ROOT / "scripts/jp-vocab-fill-fail-autofix.py").read_text(encoding="utf-8")
    shell = (ROOT / "scripts/jp-vocab-fill-fail-autofix.sh").read_text(encoding="utf-8")
    setup = (ROOT / "scripts/setup-jp-vocab-fill-fail-autofix-mac.sh").read_text(
        encoding="utf-8"
    )
    idle_mod = (ROOT / "scripts/lib/cursor_agent_idle.py").read_text(encoding="utf-8")
    hook = ROOT / ".cursor/hooks/cursor-agent-idle-track.py"
    plist = ROOT / "scripts/com.infoquests.jp-vocab-fill-fail-autofix.plist.example"
    rule = ROOT / ".cursor/rules/jp-vocab-fill-fail-autofix.mdc"

    if "list_jp_vocab_fill_unresolved_fails" not in autofix:
        raise SystemExit("FAIL: autofix must scan unresolved_fails")
    if "is_cursor_agent_idle" not in autofix:
        raise SystemExit("FAIL: autofix must gate on cursor idle")
    if "Agent.prompt" not in autofix and "cursor_sdk" not in autofix:
        raise SystemExit("FAIL: autofix must call cursor-sdk Agent")
    if "PAUSE" not in autofix or "PAUSE" not in shell:
        raise SystemExit("FAIL: must support PAUSE.switch")
    if "arm_ide_followup" not in autofix or "arm-followup" not in autofix:
        raise SystemExit("FAIL: no-API-key path must arm IDE followup")
    stop_hook = ROOT / ".cursor/hooks/jp-vocab-fill-fail-autofix-stop.py"
    if not stop_hook.is_file():
        raise SystemExit("FAIL: missing jp-vocab-fill-fail-autofix-stop.py")
    if "followup_message" not in stop_hook.read_text(encoding="utf-8"):
        raise SystemExit("FAIL: stop hook must emit followup_message when armed")
    if "600" not in idle_mod and "DEFAULT_IDLE_SECONDS = 600" not in idle_mod:
        raise SystemExit("FAIL: default idle gate must be 600s (10 min)")
    if "mark_agent_busy" not in idle_mod or "mark_agent_idle" not in idle_mod:
        raise SystemExit("FAIL: idle helper must mark busy/idle")
    if not hook.is_file():
        raise SystemExit("FAIL: missing cursor-agent-idle-track hook")
    if "mark_agent_idle" not in hook.read_text(encoding="utf-8"):
        raise SystemExit("FAIL: idle-track hook must mark idle on stop")
    if not plist.is_file() or "600" not in plist.read_text(encoding="utf-8"):
        raise SystemExit("FAIL: plist StartInterval must be 600")
    if "setup-jp-vocab-fill-fail-autofix-mac.sh" not in setup and "LABEL=" not in setup:
        raise SystemExit("FAIL: setup script incomplete")
    if not rule.is_file():
        raise SystemExit("FAIL: missing jp-vocab-fill-fail-autofix.mdc")

    hooks_json = ROOT / ".cursor/hooks.json"
    if hooks_json.is_file():
        hj = hooks_json.read_text(encoding="utf-8")
        if "cursor-agent-idle-track.py" not in hj:
            raise SystemExit("FAIL: hooks.json must wire cursor-agent-idle-track")
        if "stop" not in hj:
            raise SystemExit("FAIL: hooks.json must have stop hooks")

    registry = (
        ROOT / "scripts/maintenance_center/cron_tasks/registry.py"
    ).read_text(encoding="utf-8")
    if "jp-vocab-fill-fail-autofix" not in registry:
        raise SystemExit("FAIL: registry must list jp-vocab-fill-fail-autofix")

    from lib.cursor_agent_idle import (  # noqa: E402
        is_cursor_agent_idle,
        mark_agent_busy,
        mark_agent_idle,
        write_idle_state,
        read_idle_state,
        STATE_PATH,
    )

    # 单元：忙 → 不可；idle 立刻 → 不可；idle 够久 → 可
    old = STATE_PATH.read_text(encoding="utf-8") if STATE_PATH.is_file() else None
    try:
        mark_agent_busy(event="test")
        ok, reason = is_cursor_agent_idle(min_idle_seconds=600)
        assert not ok and reason == "cursor_agent_busy", (ok, reason)

        mark_agent_idle(event="test_stop")
        ok2, reason2 = is_cursor_agent_idle(min_idle_seconds=600)
        assert not ok2 and reason2.startswith("idle_wait_"), (ok2, reason2)

        # 伪造很久以前的 idle_since
        st = read_idle_state()
        st["busy"] = False
        st["idle_since"] = "2020-01-01T00:00:00+00:00"
        write_idle_state(st)
        ok3, reason3 = is_cursor_agent_idle(min_idle_seconds=600)
        assert ok3 and reason3.startswith("idle_ok_"), (ok3, reason3)
    finally:
        if old is None:
            STATE_PATH.unlink(missing_ok=True)
        else:
            STATE_PATH.write_text(old, encoding="utf-8")

    # dry load helpers from hyphenated filename
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "jp_vocab_fill_fail_autofix",
        ROOT / "scripts/jp-vocab-fill-fail-autofix.py",
    )
    assert spec and spec.loader
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)

    sample = [
        {
            "word_id": 460,
            "word": "～でしょう",
            "kind": "grammar",
            "status": "failed",
            "error": "generate:bad json",
            "finished_at": "2026-07-29 22:51:17",
        }
    ]
    prompt = m._build_prompt(sample)
    if "请检测并处理" not in prompt or "mark_resolved" not in prompt:
        raise SystemExit("FAIL: prompt must ask diagnose + fill + mark_resolved + prevent")
    if "～でしょう" not in prompt:
        raise SystemExit("FAIL: prompt must include fail word")

    print("[check_jp_vocab_fill_fail_autofix] OK")


if __name__ == "__main__":
    main()
