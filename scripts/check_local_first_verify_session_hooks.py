#!/usr/bin/env python3
"""Regression: sessionStart must inject local-first verify reminder."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HOOKS_JSON = ROOT / ".cursor" / "hooks.json"
HOOK = ROOT / ".cursor" / "hooks" / "local-first-verify-session.py"
RULE = ROOT / ".cursor" / "rules" / "local-first-verify.mdc"
HOOK_CMD = ".cursor/hooks/local-first-verify-session.py"

REQUIRED_PHRASES = [
    "本地测通",
    "db:sync-remote-to-local",
    "Admin",
    "agent_ready_to_publish",
    "publish",
]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not HOOKS_JSON.is_file():
        fail("missing .cursor/hooks.json")
    hooks = json.loads(HOOKS_JSON.read_text(encoding="utf-8"))
    session = hooks.get("hooks", {}).get("sessionStart") or []
    cmds = [h.get("command", "") for h in session if isinstance(h, dict)]
    if HOOK_CMD not in cmds:
        fail(f"hooks.json sessionStart missing {HOOK_CMD}")

    for path in (HOOK, RULE):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    rule_text = RULE.read_text(encoding="utf-8")
    for phrase in (
        "本地先验证",
        "db:sync-remote-to-local",
        "Admin",
        "agent_ready_to_publish",
        "alwaysApply: true",
    ):
        if phrase not in rule_text:
            fail(f"{RULE.name} missing {phrase!r}")

    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        cwd=str(ROOT),
        input="{}",
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        fail(f"{HOOK.name} exit {proc.returncode}: {proc.stderr}")
    out = (proc.stdout or "").strip()
    try:
        data = json.loads(out)
    except json.JSONDecodeError as exc:
        fail(f"{HOOK.name} stdout not JSON: {exc}: {out[:200]}")
    ctx = data.get("additional_context")
    if not isinstance(ctx, str) or not ctx.strip():
        fail(f"{HOOK.name} missing additional_context")
    for phrase in REQUIRED_PHRASES:
        if phrase not in ctx:
            fail(f"{HOOK.name} additional_context missing {phrase!r}")

    print("OK: local-first-verify sessionStart hook + rule present")


if __name__ == "__main__":
    main()
