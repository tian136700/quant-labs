#!/usr/bin/env python3
"""Regression: English teacher Tencent Meeting ID + copy from /en-lesson."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    ROOT / "src/lib/en-lesson-tencent-meeting.ts": (
        "normalizeTencentMeetingId",
        "resolveEnLessonMeetingIdForCopy",
        "EN_LESSON_NO_MEETING_ID_MESSAGE",
        "此老师没有会议号",
    ),
    ROOT / "src/lib/en-lesson-teacher-db.ts": (
        "tencent_meeting_id",
        "addEnLessonTeacherColumnIfMissing",
    ),
    ROOT / "src/app/api/admin/en-lesson-teachers/route.ts": (
        "tencent_meeting_id",
        "normalizeTencentMeetingId",
    ),
    ROOT / "src/components/en-lesson-page/EnLessonStatusTable.tsx": (
        "会议号",
        "copyMeetingIdForLesson",
        "en-lesson-tencent-tag",
        "resolveEnLessonMeetingIdForCopy",
    ),
    ROOT / "src/components/EnLessonPage.tsx": (
        "CopyToast",
        "onCopyFeedback",
        "tencentMeetingId",
    ),
    ROOT / "src/components/admin-jp-lesson-teachers-page/AdminJpLessonTeachersList.tsx": (
        "腾讯会议号",
        "col-tencent-meeting",
        'teacherSubject === "en"',
    ),
}


def main() -> int:
    errors: list[str] = []
    for path, needles in FILES.items():
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")
            continue
        text = path.read_text(encoding="utf-8")
        for needle in needles:
            if needle not in text:
                errors.append(f"{path.relative_to(ROOT)}: missing {needle!r}")

    # Meeting copy resolver: one teacher without id → fixed message
    meeting_lib = (ROOT / "src/lib/en-lesson-tencent-meeting.ts").read_text(
        encoding="utf-8"
    )
    if 'return { ok: false, message: EN_LESSON_NO_MEETING_ID_MESSAGE }' not in meeting_lib:
        errors.append("resolveEnLessonMeetingIdForCopy must return 此老师没有会议号")

    if errors:
        print("\n".join(errors))
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
