#!/usr/bin/env python3
"""Regression: /en-lesson 填好上课时间 → 默认上课中；状态文案上课中/上课完."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ROUTE = ROOT / "src/app/api/en-lesson/route.ts"
HELPERS = ROOT / "src/components/en-lesson-page/en-lesson-page-helpers.tsx"
TABLE = ROOT / "src/components/en-lesson-page/EnLessonStatusTable.tsx"
PAGE = ROOT / "src/components/EnLessonPage.tsx"


def main() -> int:
    errors: list[str] = []

    route = ROUTE.read_text(encoding="utf-8")
    if 'updateEnLessonProgress' not in route:
        errors.append("route: missing updateEnLessonProgress")
    if '"learning"' not in route or "class_schedules.length > 0" not in route:
        errors.append("route: set_class_schedules must auto-set learning when schedules non-empty")

    helpers = HELPERS.read_text(encoding="utf-8")
    if 'title: "上课中"' not in helpers or 'title: "上课完"' not in helpers:
        errors.append("helpers: LESSON_STATUS_SECTIONS must use 上课中/上课完")

    table = TABLE.read_text(encoding="utf-8")
    if ">上课中<" not in table or ">上课完<" not in table:
        errors.append("StatusTable select options must be 上课中/上课完")
    if "上课状态" not in table:
        errors.append("StatusTable column label should be 上课状态")

    page = PAGE.read_text(encoding="utf-8")
    if 'setMobileStatusFilter("learning")' not in page:
        errors.append("EnLessonPage: after schedule save switch to learning tab")

    if errors:
        print("\n".join(errors))
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
