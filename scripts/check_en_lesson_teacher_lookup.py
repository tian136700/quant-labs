#!/usr/bin/env python3
"""回归：英语老师 lookup API + 名称匹配（Telegram T老师名）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    route = (
        ROOT / "src/app/api/admin/en-lesson-teachers/lookup/route.ts"
    ).read_text(encoding="utf-8")
    lib = (
        ROOT / "src/lib/en-lesson-teacher-telegram-lookup.ts"
    ).read_text(encoding="utf-8")
    docs = (ROOT / "docs/en-lesson-teacher-lookup-api.txt").read_text(encoding="utf-8")

    if "requireAdminOrUploadToken" not in route:
        raise SystemExit("FAIL: lookup route must use requireAdminOrUploadToken")
    if "lookupEnLessonTeacherReview" not in route:
        raise SystemExit("FAIL: lookup route must call lookupEnLessonTeacherReview")
    if "英语这个模块里面没有这个老师" not in lib:
        raise SystemExit("FAIL: missing not-found message")
    if "matchEnLessonTeachersByQuery" not in lib:
        raise SystemExit("FAIL: missing match helper")
    if "en-lesson-teachers/lookup" not in docs:
        raise SystemExit("FAIL: docs must describe lookup URL")

    print("[check_en_lesson_teacher_lookup] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
