#!/usr/bin/env python3
"""Regression: sessionStart hooks must teach ≤1000 LOC — feature still ships, split first."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HOOKS_JSON = ROOT / ".cursor" / "hooks.json"
FEATURE_HOOK = ROOT / ".cursor" / "hooks" / "feature-index-loc-guard-session.py"
QUEUE_HOOK = ROOT / ".cursor" / "hooks" / "loc-split-tracker-session.py"
AFTER_EDIT = ROOT / ".cursor" / "hooks" / "loc-split-after-edit.py"
RULE = ROOT / ".cursor" / "rules" / "file-split-queue.mdc"

# Must appear so agents don't misread as "skip the feature"
REQUIRED_PHRASES = [
    "功能照改",
    "1000",
    "拆",
]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def run_hook(path: Path) -> dict:
    proc = subprocess.run(
        [sys.executable, str(path)],
        cwd=str(ROOT),
        input="{}",
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        fail(f"{path.name} exit {proc.returncode}: {proc.stderr}")
    out = (proc.stdout or "").strip()
    if not out:
        fail(f"{path.name} produced empty stdout")
    try:
        data = json.loads(out)
    except json.JSONDecodeError as exc:
        fail(f"{path.name} stdout is not JSON additional_context: {exc}: {out[:200]}")
    ctx = data.get("additional_context")
    if not isinstance(ctx, str) or not ctx.strip():
        fail(f"{path.name} missing additional_context string")
    return data


def main() -> None:
    if not HOOKS_JSON.is_file():
        fail("missing .cursor/hooks.json")
    hooks = json.loads(HOOKS_JSON.read_text(encoding="utf-8"))
    session = hooks.get("hooks", {}).get("sessionStart") or []
    cmds = [h.get("command", "") for h in session if isinstance(h, dict)]
    for need in (
        ".cursor/hooks/feature-index-loc-guard-session.py",
        ".cursor/hooks/loc-split-tracker-session.py",
    ):
        if need not in cmds:
            fail(f"hooks.json sessionStart missing {need}")

    for path in (FEATURE_HOOK, QUEUE_HOOK, AFTER_EDIT, RULE):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    for path in (FEATURE_HOOK, QUEUE_HOOK):
        data = run_hook(path)
        ctx = data["additional_context"]
        for phrase in REQUIRED_PHRASES:
            if phrase not in ctx:
                fail(f"{path.name} additional_context missing {phrase!r}")
        # Explicit anti-pattern: must not only say "skip work"
        if "不是跳过" not in ctx and "不是" not in ctx and "功能照改" not in ctx:
            fail(f"{path.name} must clarify feature still ships (功能照改)")
        print(f"OK: {path.relative_to(ROOT)}")

    rule = RULE.read_text(encoding="utf-8")
    for phrase in ("功能照改", "正在改的这块功能", "1000"):
        if phrase not in rule:
            fail(f"file-split-queue.mdc missing {phrase!r}")
    print(f"OK: {RULE.relative_to(ROOT)}")

    after = AFTER_EDIT.read_text(encoding="utf-8")
    if "功能照改" not in after:
        fail("loc-split-after-edit.py should say 功能照改")
    print(f"OK: {AFTER_EDIT.relative_to(ROOT)}")

    print("All file-split sessionStart guard checks passed.")


if __name__ == "__main__":
    main()
