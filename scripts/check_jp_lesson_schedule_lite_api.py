#!/usr/bin/env python3
"""回归：日程管理 GET ?view=schedule 须用轻量列表（禁全量例句/笔记）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    jp_route = (ROOT / "src/app/api/jp-lesson/route.ts").read_text(encoding="utf-8")
    en_route = (ROOT / "src/app/api/en-lesson/route.ts").read_text(encoding="utf-8")
    jp_list = (ROOT / "src/lib/jp-lesson-schedule-list.ts").read_text(encoding="utf-8")
    en_list = (ROOT / "src/lib/en-lesson-schedule-list.ts").read_text(encoding="utf-8")
    shared = (ROOT / "src/lib/lesson-schedule-list-shared.ts").read_text(encoding="utf-8")
    page = (ROOT / "src/components/JpLessonSchedulePage.tsx").read_text(encoding="utf-8")
    jp_cache = (ROOT / "src/lib/jp-api-cache.ts").read_text(encoding="utf-8")
    en_cache = (ROOT / "src/lib/en-api-cache.ts").read_text(encoding="utf-8")

    if 'get("view") === "schedule"' not in jp_route:
        errors.append("GET /api/jp-lesson must branch on view=schedule")
    if "listJpLessonsForSchedule" not in jp_route:
        errors.append("jp-lesson schedule view must call listJpLessonsForSchedule")
    if "slimVocabRefForSchedule" not in jp_route:
        errors.append("jp-lesson schedule view must slim refs")

    if 'get("view") === "schedule"' not in en_route:
        errors.append("GET /api/en-lesson must branch on view=schedule")
    if "listEnLessonsForSchedule" not in en_route:
        errors.append("en-lesson schedule view must call listEnLessonsForSchedule")
    schedule_en = en_route.split("scheduleView", 1)[1].split(
        "const [lessons, refs, notes]", 1
    )[0]
    if "listEnLessonNotes" in schedule_en:
        errors.append("en-lesson schedule view must NOT call listEnLessonNotes")

    jp_select = jp_list.split("SCHEDULE_LESSON_SELECT", 1)[1].split("FROM jp_lesson", 1)[0]
    if "meanings" in jp_select or "example_sentences" in jp_select or "annotations" in jp_select:
        errors.append("jp schedule SELECT must omit meanings/annotations/example_sentences")

    en_select = en_list.split("SCHEDULE_LESSON_SELECT", 1)[1].split("FROM en_lesson", 1)[0]
    if "remarks" in en_select or "meanings" in en_select:
        errors.append("en schedule SELECT must omit remarks/meanings")

    if "truncateLessonContentForSchedule" not in shared:
        errors.append("shared must export truncateLessonContentForSchedule")
    if "listJpLessonsForSchedule" not in jp_list:
        errors.append("jp-lesson-schedule-list must export listJpLessonsForSchedule")
    if "listEnLessonsForSchedule" not in en_list:
        errors.append("en-lesson-schedule-list must export listEnLessonsForSchedule")

    # 页面接线：防只加后端、日程页仍拉全量
    if "JP_LESSON_SCHEDULE_CACHE_KEY" not in jp_cache:
        errors.append("jp-api-cache must define JP_LESSON_SCHEDULE_CACHE_KEY")
    if "EN_LESSON_SCHEDULE_CACHE_KEY" not in en_cache:
        errors.append("en-api-cache must define EN_LESSON_SCHEDULE_CACHE_KEY")
    if "/api/jp-lesson?view=schedule" not in page:
        errors.append("JpLessonSchedulePage must fetch /api/jp-lesson?view=schedule")
    if "/api/en-lesson?view=schedule" not in page:
        errors.append("JpLessonSchedulePage must fetch /api/en-lesson?view=schedule")
    if "JP_LESSON_SCHEDULE_CACHE_KEY" not in page:
        errors.append("schedule page must use JP_LESSON_SCHEDULE_CACHE_KEY")
    if "EN_LESSON_SCHEDULE_CACHE_KEY" not in page:
        errors.append("schedule page must use EN_LESSON_SCHEDULE_CACHE_KEY")

    if errors:
        print("check_jp_lesson_schedule_lite_api FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_lesson_schedule_lite_api OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
