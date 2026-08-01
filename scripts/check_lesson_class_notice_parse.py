#!/usr/bin/env python3
"""Regression: 英语「文字拆解」保留；日语 JpLessonNextClassEditModal 禁止再挂签到拆解框."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSE = ROOT / "src/lib/lesson-class-notice-parse.ts"
PASTE = ROOT / "src/components/LessonClassNoticePasteBox.tsx"
EN_MODAL = ROOT / "src/components/EnLessonNextClassEditModal.tsx"
JP_MODAL = ROOT / "src/components/JpLessonNextClassEditModal.tsx"

SAMPLE = """课程签到成功通知
课程状态    您的口语课将于1小时后开始
任课教师    AliciaT
上课时间    2026-08-01 09:00
上课地点    腾讯会议
联系方式    849-255-3123
"""

TEACHER_LABEL_RE = re.compile(
    r"(?:任课教师|上课老师|授课教师|教师|老师)\s*[:：]?\s*([^\s\n\r]+)"
)
DATETIME_LABEL_RE = re.compile(
    r"(?:上课时间|开课时间|课程时间)\s*[:：]?\s*([^\n\r]+)"
)
MEETING_LABEL_RE = re.compile(
    r"(?:联系方式|会议号|腾讯会议号|会议ID|Meeting\s*ID)\s*[:：]?\s*([^\n\r]+)",
    re.I,
)
DATE_TIME_INLINE_RE = re.compile(
    r"(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s+(\d{1,2})\s*[:：点]\s*(\d{1,2})"
)


def pad2(n: int) -> str:
    return f"{n:02d}"


def parse_notice(raw: str) -> dict[str, str | None]:
    text = (raw or "").replace("\u00a0", " ").strip()
    teacher = None
    m = TEACHER_LABEL_RE.search(text)
    if m:
        teacher = m.group(1).strip()
    date = time = None
    labeled = DATETIME_LABEL_RE.search(text)
    chunk = labeled.group(1).strip() if labeled else text
    inline = DATE_TIME_INLINE_RE.search(chunk)
    if inline:
        date = f"{inline.group(1)}-{pad2(int(inline.group(2)))}-{pad2(int(inline.group(3)))}"
        time = f"{pad2(int(inline.group(4)))}:{pad2(int(inline.group(5)))}"
    meeting = None
    mm = MEETING_LABEL_RE.search(text)
    if mm:
        meeting = mm.group(1).strip().replace(" ", "")
    return {
        "teacherName": teacher,
        "date": date,
        "time": time,
        "tencentMeetingId": meeting,
    }


def main() -> int:
    errors: list[str] = []

    for path, needles in (
        (
            PARSE,
            (
                "export function parseLessonClassNoticeText",
                "export function matchLessonTeacherByNoticeName",
                "任课教师",
                "上课时间",
                "tencentMeetingId",
                "联系方式",
            ),
        ),
        (
            PASTE,
            ("文字拆解", "拆解填入", "lesson-class-notice-paste"),
        ),
        (
            EN_MODAL,
            (
                "LessonClassNoticePasteBox",
                "parseLessonClassNoticeText",
                "onAddTeacher",
                "teacherIds",
            ),
        ),
    ):
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")
            continue
        text = path.read_text(encoding="utf-8")
        for needle in needles:
            if needle not in text:
                errors.append(f"{path.relative_to(ROOT)}: missing {needle!r}")

    # 日语新课已去掉文字拆解，禁止再挂回
    if JP_MODAL.is_file():
        jp_text = JP_MODAL.read_text(encoding="utf-8")
        for banned in (
            "LessonClassNoticePasteBox",
            "parseLessonClassNoticeText",
            "文字拆解",
        ):
            if banned in jp_text:
                errors.append(
                    f"{JP_MODAL.relative_to(ROOT)}: must not contain {banned!r} "
                    "(日语新课已去掉签到文字拆解)"
                )
    else:
        errors.append(f"missing {JP_MODAL.relative_to(ROOT)}")

    got = parse_notice(SAMPLE)
    expect = {
        "teacherName": "AliciaT",
        "date": "2026-08-01",
        "time": "09:00",
        "tencentMeetingId": "849-255-3123",
    }
    if got != expect:
        errors.append(f"sample parse mismatch: got={got} expect={expect}")

    slash = parse_notice("任课教师：李老师\n上课时间：2026/8/1 9:30")
    if slash != {
        "teacherName": "李老师",
        "date": "2026-08-01",
        "time": "09:30",
        "tencentMeetingId": None,
    }:
        errors.append(f"slash/date parse mismatch: {slash}")

    if errors:
        print("\n".join(errors))
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
