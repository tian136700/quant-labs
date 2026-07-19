#!/usr/bin/env python3
"""Regression: 开课前 2h 自动启用 + dirlock 定时 + 抽完禁用临近课跳过。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENABLE_TS = ROOT / "src/lib/teacher-user-schedule-enable.ts"
DISABLE_TS = ROOT / "src/lib/teacher-user-quiz-complete-disable.ts"
ROUTE_TS = ROOT / "src/app/api/admin/teacher-user-pre-class-enable/route.ts"
SHELL = ROOT / "scripts/teacher-user-pre-class-enable.sh"
PLIST = ROOT / "scripts/com.infoquests.teacher-user-pre-class-enable.plist.example"

WITHIN_RE = re.compile(
    r"TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS\s*=\s*2\s*\*\s*60\s*\*\s*60\s*\*\s*1000"
)
RUN_RE = re.compile(r"export async function runTeacherUserPreClassEnable")
DIRLOCK_RE = re.compile(r"dirlock_acquire")
INTERVAL_RE = re.compile(r"<integer>600</integer>")
SKIP_RE = re.compile(r"near_upcoming_or_ongoing_class")


def main() -> int:
    errors: list[str] = []

    enable = ENABLE_TS.read_text(encoding="utf-8")
    disable = DISABLE_TS.read_text(encoding="utf-8")
    route = ROUTE_TS.read_text(encoding="utf-8")
    shell = SHELL.read_text(encoding="utf-8")
    plist = PLIST.read_text(encoding="utf-8")

    if not WITHIN_RE.search(enable):
        errors.append("missing 2h TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS")
    if not RUN_RE.search(enable):
        errors.append("missing runTeacherUserPreClassEnable")
    if "runTeacherUserPreClassEnable" not in route:
        errors.append("API route does not call runTeacherUserPreClassEnable")
    if not DIRLOCK_RE.search(shell):
        errors.append("shell missing dirlock_acquire (overlap lock)")
    if not INTERVAL_RE.search(plist):
        errors.append("plist StartInterval must be 600 (10 minutes)")
    if not SKIP_RE.search(disable):
        errors.append("quiz-complete-disable must skip near class")
    if "listLinkedUserIdsWithClassNearNow" not in disable:
        errors.append("quiz-complete-disable must use listLinkedUserIdsWithClassNearNow")

    if errors:
        print("check_teacher_user_pre_class_enable: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("check_teacher_user_pre_class_enable: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
