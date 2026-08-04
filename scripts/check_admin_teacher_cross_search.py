#!/usr/bin/env python3
"""回归：人员管理「全部」+ 跨科搜索 + 切科目不保留旧 teacher= + 输入即过滤。"""

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
LOCALE = ROOT / "src/lib/locale-path.ts"
SUBJECT = ROOT / "src/lib/lesson-teacher-subject.ts"
BY_SUBJECT = (
    ROOT
    / "src/components/admin-jp-lesson-teachers-page/admin-jpl-teachers-by-subject.ts"
)


def main() -> int:
    page = PAGE.read_text(encoding="utf-8")
    listing = LIST.read_text(encoding="utf-8")
    locale = LOCALE.read_text(encoding="utf-8")
    subject = SUBJECT.read_text(encoding="utf-8")
    by_subject = BY_SUBJECT.read_text(encoding="utf-8")
    errors: list[str] = []

    if 'LessonTeacherSubjectFilter = LessonTeacherSubject | "all"' not in locale:
        errors.append("locale-path must define LessonTeacherSubjectFilter with all")
    if "parseLessonTeacherSubjectFilter" not in locale:
        errors.append("locale-path must export parseLessonTeacherSubjectFilter")
    if 'raw === "all"' not in locale:
        errors.append("parseLessonTeacherSubjectFilter must accept all")

    if "lessonTeacherSubjectFilterLabel" not in subject:
        errors.append("lesson-teacher-subject must label 全部")
    if "lessonTeacherSubjectsToLoad" not in subject:
        errors.append("lesson-teacher-subject must list subjects to load for all")

    if "teacherRowKey" not in by_subject:
        errors.append("by-subject helper must key rows as subject:id")
    if "filterTeacherHitsBySearch" not in by_subject:
        errors.append("by-subject helper must filter hits without id collision")

    if 'value="all"' not in listing:
        errors.append("subject select must include 全部 option")
    if "teacherSubjectFilter" not in listing:
        errors.append("list must use teacherSubjectFilter")
    if "filteredHits" not in listing:
        errors.append("list must render filteredHits")
    if "查无此人" not in listing:
        errors.append("empty search must say 查无此人")

    if "parseLessonTeacherSubjectFilter" not in page:
        errors.append("page must parse subject filter including all")
    if "filterTeacherHitsBySearch" not in page:
        errors.append("page must filter hits by searchDraft")
    if not re.search(r"params\.delete\(\s*[\"']teacher[\"']\s*\)", page):
        errors.append("switchTeacherSubject must delete teacher= when changing subject")
    if re.search(
        r"if\s*\(\s*!filteredTeachers\.some[\s\S]*?setSearchDraft\(\s*[\"'][\"']\s*\)",
        page,
    ):
        errors.append("must not clear searchDraft when focus teacher missing from filter")

    if errors:
        print("check_admin_teacher_cross_search FAILED:")
        for err in errors:
            print(f"  - {err}")
        return 1
    print("check_admin_teacher_cross_search OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
