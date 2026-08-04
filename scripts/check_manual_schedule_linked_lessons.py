#!/usr/bin/env python3
"""回归：手动日程可关联最多 2 本教材（日语标题默认日语新课）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LINKED = ROOT / "src/lib/jp-lesson-manual-schedule-linked.ts"
DB = ROOT / "src/lib/jp-lesson-manual-schedule-db.ts"
TYPES = ROOT / "src/lib/jp-lesson-manual-schedule.ts"
MODAL = ROOT / "src/components/JpLessonManualScheduleModal.tsx"
PICKER = ROOT / "src/components/JpLessonManualScheduleLessonPicker.tsx"
PICK_MODAL = ROOT / "src/components/JpLessonManualScheduleLessonPickModal.tsx"
SYNC = ROOT / "src/lib/manual-schedule-sync-linked-lesson.ts"
ACTIONS = ROOT / "src/components/jp-lesson-schedule-page/useJpLessonSchedulePageActions.ts"
API = ROOT / "src/app/api/jp-lesson/manual-schedules/route.ts"
LAYOUT = ROOT / "src/components/jp-lesson-schedule-page/JpLessonScheduleLayout.tsx"
PAGE = ROOT / "src/components/JpLessonSchedulePage.tsx"
SCHEMA = ROOT / "schema.sql"


def main() -> int:
    errors: list[str] = []

    linked = LINKED.read_text(encoding="utf-8")
    if "MANUAL_SCHEDULE_LINKED_LESSONS_MAX = 2" not in linked:
        errors.append("linked helper must cap at 2 textbooks")
    if "normalizeManualScheduleLinkedLessons" not in linked:
        errors.append("missing normalizeManualScheduleLinkedLessons")
    if "manualScheduleLessonDisplayName" not in linked:
        errors.append("linked helper must expose manualScheduleLessonDisplayName")
    if "course_label" not in linked or "uploaded_at" not in linked:
        errors.append("ManualScheduleLessonOption must include course_label + uploaded_at")
    if "manualScheduleHasLinkedLessonOnSameSlot" not in linked:
        errors.append("linked helper must expose manualScheduleHasLinkedLessonOnSameSlot")
    if "findDedupedLessonEventForManualLinkedCover" not in linked:
        errors.append("linked helper must expose findDedupedLessonEventForManualLinkedCover")
    if "normalizeClassAtForCompare" not in linked:
        errors.append("linked same-slot cover must compare via normalizeClassAtForCompare")
    if "findDedupedLessonEventForManualTeacherSlotCover" not in linked:
        errors.append(
            "linked helper must expose findDedupedLessonEventForManualTeacherSlotCover"
        )
    if "manualScheduleCoveredByLessonTeacherSlot" not in linked:
        errors.append(
            "linked helper must expose manualScheduleCoveredByLessonTeacherSlot"
        )
    if "scheduleTeacherNamesEqual" not in linked:
        errors.append("linked helper must expose scheduleTeacherNamesEqual")
    if "stripScheduleTeacherDisplayExtras" not in linked:
        errors.append(
            "teacher compare must strip display extras (玉老师 · 60 / 1h → 玉老师)"
        )
    if 'indexOf(" · ")' not in linked and "indexOf(' · ')" not in linked:
        errors.append(
            "stripScheduleTeacherDisplayExtras must cut on middle-dot fee suffix"
        )

    # 行为：展示名带费率时须与手动纯称呼相等（否则同堂两条）
    def strip_extras(token: str) -> str:
        text = token.strip()
        cut = text.find(" · ")
        if cut <= 0:
            return text
        return text[:cut].strip()

    def names_equal(a: str, b: str) -> bool:
        left = sorted(
            x for x in (strip_extras(t) for t in re.split(r"[、,，]", a)) if x
        )
        right = sorted(
            x for x in (strip_extras(t) for t in re.split(r"[、,，]", b)) if x
        )
        return bool(left) and left == right

    if not names_equal("玉老师 · 60 / 1h", "玉老师"):
        errors.append(
            "behavior: lesson display label must equal plain manual teacher name"
        )
    if names_equal("玉老师 · 60 / 1h", "李老师"):
        errors.append("behavior: different teachers must not match after strip")

    db = DB.read_text(encoding="utf-8")
    if "linked_lessons" not in db:
        errors.append("manual-schedule-db must persist linked_lessons")
    if "duplicate column name" not in db:
        errors.append("ALTER linked_lessons must be idempotent (duplicate column)")

    types = TYPES.read_text(encoding="utf-8")
    if "linked_lessons" not in types:
        errors.append("JpLessonManualSchedule type must include linked_lessons")

    modal = MODAL.read_text(encoding="utf-8")
    if "JpLessonManualScheduleLessonPicker" not in modal:
        errors.append("manual schedule modal must render lesson picker")
    if "linked_lessons" not in modal:
        errors.append("modal save draft must include linked_lessons")
    if "syncManualScheduleLinkedLessonToLearning" in modal:
        errors.append(
            "edit modal must NOT sync on pick; sync only on Save (avoid double progress)"
        )
    if "setLinkedLessons" not in modal and "normalizeManualScheduleLinkedLessons" not in modal:
        errors.append("modal pick must only update local linked_lessons")
    if "点「保存」后才会写入" not in modal and "点「保存」" not in modal:
        errors.append("modal hint must say sync happens on Save, not on pick")
    if "handlePickLesson" not in modal:
        errors.append("modal must handle pick via handlePickLesson")

    picker = PICKER.read_text(encoding="utf-8")
    if "日语新课" not in picker:
        errors.append("picker must label 日语新课 when title is jp")
    if 'titleSubject === "jp"' not in picker and "titleSubject === 'jp'" not in picker:
        errors.append("picker must filter jp lessons when title subject is jp")
    if "MANUAL_SCHEDULE_LINKED_LESSONS_MAX" not in picker:
        errors.append("picker must enforce max linked lessons")
    if "JpLessonManualScheduleLessonPickModal" not in picker:
        errors.append("picker must open JpLessonManualScheduleLessonPickModal")
    if "jp-lesson-manual-lesson-dropdown" in picker:
        errors.append("picker must not keep old inline dropdown for lesson select")

    pick_modal = PICK_MODAL.read_text(encoding="utf-8")
    if "上传" not in pick_modal:
        errors.append("pick modal must show upload date")
    if "parseLessonContent" not in pick_modal:
        errors.append("pick modal must show word content via parseLessonContent")
    if "manualScheduleLessonDisplayName" not in pick_modal:
        errors.append("pick modal must show textbook display name")

    sync = SYNC.read_text(encoding="utf-8")
    if "progress_status" not in sync or '"learning"' not in sync:
        errors.append("sync helper must set progress_status learning")
    if "set_class_schedules" not in sync:
        errors.append("sync helper must set_class_schedules")
    if "set_teacher" not in sync:
        errors.append("sync helper must set_teacher")

    api = API.read_text(encoding="utf-8")
    if "linked_lessons" not in api:
        errors.append("manual-schedules API must accept linked_lessons")

    page = PAGE.read_text(encoding="utf-8")
    if "jpLessons={lessons}" not in page:
        errors.append("schedule page must pass jp lessons to modal")
    if "enLessons={enLessons}" not in page:
        errors.append("schedule page must pass en lessons to modal")
    if "/jp-lesson/notes?id=" in page or "/en-lesson/notes?id=" in page:
        errors.append(
            "manual linked 教材 must open ref viewer, not /jp-lesson/notes or /en-lesson/notes"
        )
    if "jpVocabRefViewerPath" not in page or "enVocabRefViewerPath" not in page:
        errors.append("manual linked 教材 must use jpVocabRefViewerPath / enVocabRefViewerPath")
    if "selectedManualLinkedLessons" not in page:
        errors.append("schedule page must build selectedManualLinkedLessons")
    if "openLinkLessonPick" not in page:
        errors.append("schedule page must expose openLinkLessonPick for detail 关联教材")
    if "buildJpLessonSchedulePageAllEvents" not in page:
        errors.append(
            "schedule page must merge linked manual into same-slot lesson via buildJpLessonSchedulePageAllEvents"
        )
    if "copyTeacherMessageTemplate" not in page:
        errors.append("schedule page must implement copyTeacherMessageTemplate")
    if "copyTextToClipboard" not in page:
        errors.append("schedule copy must use copyTextToClipboard")
    if "buildScheduleTeacherMessageTemplate" not in page:
        errors.append("schedule page must build template via helper")

    layout = LAYOUT.read_text(encoding="utf-8")
    if "selectedManualLinkedLessons" not in layout:
        errors.append("schedule detail must show selectedManualLinkedLessons")
    if ">教材<" not in layout and "教材" not in layout:
        errors.append("schedule detail must have 教材 label")
    if "关联教材" not in layout or "openLinkLessonPick" not in layout:
        errors.append("schedule detail must have 关联教材 button calling openLinkLessonPick")
    if "复制文字模板" not in layout or "copyTeacherMessageTemplate" not in layout:
        errors.append(
            "schedule detail must have 复制文字模板 button calling copyTeacherMessageTemplate"
        )

    msg = (
        ROOT / "src/lib/jp-lesson-schedule-teacher-message.ts"
    ).read_text(encoding="utf-8")
    if "buildScheduleTeacherMessageTemplate" not in msg:
        errors.append("missing buildScheduleTeacherMessageTemplate")
    if "北京时间" not in msg:
        errors.append("teacher message template must include 北京时间")
    if "教案" not in msg:
        errors.append("teacher message template must include 教案 link section")

    link_modal = (
        ROOT / "src/components/JpLessonManualScheduleLinkFromDetailModal.tsx"
    ).read_text(encoding="utf-8")
    if "JpLessonManualScheduleLessonPickModal" not in link_modal:
        errors.append("detail link modal must reuse JpLessonManualScheduleLessonPickModal")

    actions = ACTIONS.read_text(encoding="utf-8")
    if "syncManualScheduleLinkedLessonToLearning" not in actions:
        errors.append("save manual schedule must re-sync linked lessons")
    if "handleLinkLessonFromDetail" not in actions:
        errors.append("actions must implement handleLinkLessonFromDetail")
    if "applyLinkedLessonSynced" not in actions:
        errors.append("actions must keep applyLinkedLessonSynced for save/detail sync")

    caldav = (ROOT / "src/lib/schedule-caldav-events.ts").read_text(encoding="utf-8")
    if "manualScheduleHasLinkedLessonOnSameSlot" not in caldav:
        errors.append(
            "CalDAV must skip manual events already covered by linked lesson same slot"
        )
    if "manualScheduleCoveredByLessonTeacherSlot" not in caldav:
        errors.append(
            "CalDAV must skip manual events matching lesson teacher+time+duration"
        )

    merge = (
        ROOT
        / "src/components/jp-lesson-schedule-page/buildJpLessonSchedulePageAllEvents.ts"
    ).read_text(encoding="utf-8")
    if "findDedupedLessonEventForManualLinkedCover" not in merge:
        errors.append(
            "buildJpLessonSchedulePageAllEvents must merge linked manual into same-slot lesson"
        )
    if "findDedupedLessonEventForManualTeacherSlotCover" not in merge:
        errors.append(
            "buildJpLessonSchedulePageAllEvents must drop manual when teacher+time+duration match lesson"
        )

    schema = SCHEMA.read_text(encoding="utf-8")
    if not re.search(r"jp_lesson_manual_schedule[\s\S]*linked_lessons", schema):
        errors.append("schema.sql must define linked_lessons on manual schedule")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print(
        "ok: manual schedule linked lessons (modal + sync + same-slot merge + copy template)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
