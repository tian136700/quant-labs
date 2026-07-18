#!/usr/bin/env python3
"""Regression: 学习中 + 开课 18h 内 → API 必须挂钩自动启用老师账号。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENABLE_TS = ROOT / "src/lib/teacher-user-schedule-enable.ts"
ROUTE_TS = ROOT / "src/app/api/jp-lesson/route.ts"

WITHIN_RE = re.compile(
    r"TEACHER_LESSON_LEARNING_AUTO_ENABLE_WITHIN_MS\s*=\s*18\s*\*\s*60\s*\*\s*60\s*\*\s*1000"
)
MAYBE_RE = re.compile(r"export async function maybeEnableTeacherUsersForLearningLesson")
HOOK_RE = re.compile(r"tryEnableTeacherForLearningLesson")


def main() -> int:
    enable = ENABLE_TS.read_text(encoding="utf-8")
    route = ROUTE_TS.read_text(encoding="utf-8")
    errors: list[str] = []

    if not WITHIN_RE.search(enable):
        errors.append("missing 18h TEACHER_LESSON_LEARNING_AUTO_ENABLE_WITHIN_MS")
    if not MAYBE_RE.search(enable):
        errors.append("missing maybeEnableTeacherUsersForLearningLesson")
    if "maybeEnableTeacherUsersForLearningLesson" not in route:
        errors.append("jp-lesson route does not import maybeEnableTeacherUsersForLearningLesson")
    if HOOK_RE.findall(route).__len__() < 4:
        errors.append(
            "jp-lesson route must call tryEnableTeacherForLearningLesson "
            "after set_teacher / schedules / next_class / progress (≥4)"
        )

    if errors:
        print("check_teacher_lesson_learning_auto_enable: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("check_teacher_lesson_learning_auto_enable: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
