#!/usr/bin/env python3
"""回归：日语新课「未完成」必须按 ID 升序（小 ID 在前）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "src/lib/jp-lesson-shared.ts"
PAGE = ROOT / "src/components/JpLessonPage.tsx"


def main() -> int:
    shared = SHARED.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    errors: list[str] = []

    if "export function buildJpLessonDisplayGroupsById" not in shared:
        errors.append("missing buildJpLessonDisplayGroupsById")
    if "compareJpLessonsByIdAsc" not in shared:
        errors.append("missing compareJpLessonsByIdAsc")
    if not re.search(
        r"pending:\s*buildJpLessonDisplayGroupsById\(lessonsByStatus\.pending\)",
        page,
    ):
        errors.append("JpLessonPage pending must use buildJpLessonDisplayGroupsById")
    if re.search(
        r"pending:\s*groupLessonsForDisplay\(lessonsByStatus\.pending",
        page,
    ):
        errors.append("pending must not use groupLessonsForDisplay / classTime sort")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("ok: jp-lesson pending ID asc sort")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
