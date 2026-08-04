#!/usr/bin/env python3
"""回归：人员管理搜索跨科 + 切科目不保留旧 teacher= + 输入即过滤。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "src/components/AdminJpLessonTeachersPage.tsx"
LIST = (
    ROOT
    / "src/components/admin-jp-lesson-teachers-page/AdminJpLessonTeachersList.tsx"
)
SEARCH = ROOT / "src/lib/lesson-teacher-search.ts"


def main() -> int:
    page = PAGE.read_text(encoding="utf-8")
    listing = LIST.read_text(encoding="utf-8")
    search = SEARCH.read_text(encoding="utf-8")
    errors: list[str] = []

    if "filterLessonTeachersBySearch" not in search:
        errors.append("lesson-teacher-search must export filterLessonTeachersBySearch")
    if "lessonTeacherSubjectSearchLabels" not in search:
        errors.append("lesson-teacher-search must label subjects for haystack")

    if "crossSubjectTeachers" not in page:
        errors.append("page must keep crossSubjectTeachers for cross-subject search")

    if not re.search(
        r"params\.delete\(\s*[\"']teacher[\"']\s*\)",
        page,
    ):
        errors.append("switchTeacherSubject must delete teacher= when changing subject")

    if re.search(
        r"if\s*\(\s*!filteredTeachers\.some[\s\S]*?setSearchDraft\(\s*[\"'][\"']\s*\)",
        page,
    ):
        errors.append(
            "must not clear searchDraft when focusTeacherId missing from filteredTeachers"
        )

    if not re.search(
        r"filterLessonTeachersBySearch\(\s*sortedTeachers,\s*searchDraft",
        page,
    ):
        errors.append("filteredTeachers must live-filter by searchDraft")

    if "teacherId" not in page or "opts?.teacherId" not in page:
        errors.append("switchTeacherSubject must accept teacherId for cross-subject pick")

    if "查无此人" not in listing:
        errors.append("empty search must say 查无此人")

    if errors:
        print("check_admin_teacher_cross_search FAILED:")
        for err in errors:
            print(f"  - {err}")
        return 1
    print("check_admin_teacher_cross_search OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
