#!/usr/bin/env python3
"""回归：日语新课列表搜索须包含上课老师姓名。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEARCH = ROOT / "src/lib/jp-lesson-search.ts"
PAGE = ROOT / "src/components/JpLessonPage.tsx"


def main() -> int:
    search = SEARCH.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    errors: list[str] = []

    if "export function jpLessonTeacherSearchHaystack" not in search:
        errors.append("missing jpLessonTeacherSearchHaystack")
    if "teacher_other" not in search:
        errors.append("teacher search must include teacher_other")
    if "resolveLessonTeacherRateFields" not in search:
        errors.append("teacher search must resolve teacher display names")
    if not re.search(
        r"filterJpLessonsBySearch\(\s*lessons,\s*searchQuery,\s*teacherById\s*\)",
        page,
    ):
        errors.append("JpLessonPage must pass teacherById to filterJpLessonsBySearch")
    if "查单词 / 语法 / 老师" not in page:
        errors.append("search label must mention teacher")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("ok: jp-lesson teacher search")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
