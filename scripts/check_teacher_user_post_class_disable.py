#!/usr/bin/env python3
"""Regression: 下课 10 分钟后自动禁用老师账号。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENABLE_TS = ROOT / "src/lib/teacher-user-schedule-enable.ts"
ROUTE_TS = ROOT / "src/app/api/admin/teacher-user-post-class-disable/route.ts"
SHELL = ROOT / "scripts/teacher-user-post-class-disable.sh"
PLIST = ROOT / "scripts/com.infoquests.teacher-user-post-class-disable.plist.example"
REGISTRY = ROOT / "scripts/maintenance_center/cron_tasks/registry.py"

GRACE_RE = re.compile(
    r"TEACHER_POST_CLASS_DISABLE_AFTER_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000"
)
RUN_RE = re.compile(r"export async function runTeacherUserPostClassDisable")
DUE_RE = re.compile(r"export async function listTeacherIdsDueForPostClassDisable")
DIRLOCK_RE = re.compile(r"dirlock_acquire")
INTERVAL_RE = re.compile(r"<integer>600</integer>")


def main() -> int:
    errors: list[str] = []

    enable = ENABLE_TS.read_text(encoding="utf-8")
    route = ROUTE_TS.read_text(encoding="utf-8")
    shell = SHELL.read_text(encoding="utf-8")
    plist = PLIST.read_text(encoding="utf-8")
    registry = REGISTRY.read_text(encoding="utf-8")

    if not GRACE_RE.search(enable):
        errors.append("missing 10min TEACHER_POST_CLASS_DISABLE_AFTER_MS")
    if not RUN_RE.search(enable):
        errors.append("missing runTeacherUserPostClassDisable")
    if not DUE_RE.search(enable):
        errors.append("missing listTeacherIdsDueForPostClassDisable")
    if "resolveClassDurationMinutes" not in enable:
        errors.append("post-class disable must use class duration for end time")
    if "runTeacherUserPostClassDisable" not in route:
        errors.append("API route does not call runTeacherUserPostClassDisable")
    if not DIRLOCK_RE.search(shell):
        errors.append("shell missing dirlock_acquire (overlap lock)")
    if not INTERVAL_RE.search(plist):
        errors.append("plist StartInterval must be 600 (10 minutes)")
    if "teacher-user-post-class-disable" not in registry:
        errors.append("cron registry missing teacher-user-post-class-disable")

    if errors:
        print("check_teacher_user_post_class_disable: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("check_teacher_user_post_class_disable: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
