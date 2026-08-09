#!/usr/bin/env python3
"""回归：日程/新课写入的老师名必须进人员管理，禁止只塞 teacher_other。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SYNC = ROOT / "src/lib/manual-schedule-sync-linked-lesson.ts"
PICKER = ROOT / "src/components/JpLessonTeacherSinglePicker.tsx"
EN_TEACHER_MODAL = ROOT / "src/components/EnLessonTeacherEditModal.tsx"
EN_NEXT_CLASS = ROOT / "src/components/EnLessonNextClassEditModal.tsx"
ACTIONS = ROOT / "src/components/jp-lesson-schedule-page/useJpLessonSchedulePageActions.ts"
RULE = ROOT / ".cursor/rules/lesson-teacher-personnel-ensure.mdc"


def main() -> int:
    errors: list[str] = []

    sync = SYNC.read_text(encoding="utf-8")
    if "ensureLessonTeacherInPersonnel" not in sync:
        errors.append("sync must export/use ensureLessonTeacherInPersonnel")
    if "teacherAdminApiPath" not in sync and "/api/admin/en-lesson-teachers" not in sync:
        errors.append("ensure path must POST admin en/jp lesson-teachers APIs")
    if "teacher_other: matched" in sync or "teacher_other: matched ?" in sync:
        errors.append("sync must not write unmatched names to teacher_other")
    if "teacher_other: null" not in sync:
        errors.append("set_teacher after ensure must clear teacher_other")
    if 'teacher_ids: matched ? [matched.id] : []' in sync:
        errors.append("forbidden unmatched empty teacher_ids + teacher_other fallback")

    picker = PICKER.read_text(encoding="utf-8")
    if "resolveValueForSave" not in picker:
        errors.append("picker must expose resolveValueForSave")
    if "只当文本" in picker or "不自动入库" in picker:
        errors.append("picker must not treat unmatched typed names as free text")
    if "runAddTeacher" not in picker or "buildLessonTeacherAddInput" not in picker:
        errors.append("picker save must auto-create via runAddTeacher")
    # ensure auto-create sits inside resolveValueForSave implementation (not the type)
    impl_marker = "resolveValueForSave: async () =>"
    impl_idx = picker.find(impl_marker)
    if impl_idx < 0:
        errors.append("picker must implement resolveValueForSave: async () =>")
    elif "runAddTeacher(input)" not in picker[impl_idx : impl_idx + 1200]:
        errors.append("resolveValueForSave must call runAddTeacher for unmatched names")

    en_modal = EN_TEACHER_MODAL.read_text(encoding="utf-8")
    if "onAddTeacher" not in en_modal:
        errors.append("EnLessonTeacherEditModal must create via onAddTeacher")

    en_next = EN_NEXT_CLASS.read_text(encoding="utf-8")
    if "onAddTeacher" not in en_next:
        errors.append("EnLessonNextClassEditModal must create missing teachers on save")

    actions = ACTIONS.read_text(encoding="utf-8")
    if "ensuredTeacher" not in actions:
        errors.append("schedule actions must merge ensuredTeacher into teacher lists")

    if not RULE.is_file():
        errors.append("missing .cursor/rules/lesson-teacher-personnel-ensure.mdc")
    else:
        rule = RULE.read_text(encoding="utf-8")
        if "teacher_other" not in rule or "ensureLessonTeacherInPersonnel" not in rule:
            errors.append("rule must document teacher_other ban + ensure helper")

    if errors:
        print("FAIL check_lesson_teacher_personnel_ensure:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK check_lesson_teacher_personnel_ensure")
    return 0


if __name__ == "__main__":
    sys.exit(main())
