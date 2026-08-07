#!/usr/bin/env python3
"""Regression: 下课禁用补跑窗口 — 昨天已下课的课不应整日 teachers_due。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENABLE = (ROOT / "src/lib/teacher-user-schedule-enable.ts").read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    # 微老师案：旧逻辑 hasFinishedPastGrace && !hasBlocking 会整天 due
    if "hasFinishedPastGrace" in ENABLE:
        errors.append(
            "post-class due must not use hasFinishedPastGrace (causes all-day due)"
        )
    if "listTeacherPostClassDues" not in ENABLE:
        errors.append("missing listTeacherPostClassDues")
    if "nowMs <= latestDisableAt + catchupMs" not in ENABLE:
        errors.append(
            "listTeacherPostClassDues must cap: now <= latestDisableAt + catchupMs"
        )

    if errors:
        print("check_teacher_user_post_class_catchup: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("check_teacher_user_post_class_catchup: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
