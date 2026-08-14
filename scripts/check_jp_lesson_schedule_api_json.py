#!/usr/bin/env python3
"""回归：日程管理客户端禁止 res.json()，HTML 错误页须转成可读中文。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = [
    ROOT / "src/lib/jp-lesson-manual-schedule.ts",
    ROOT / "src/components/JpLessonSchedulePage.tsx",
    ROOT / "src/components/jp-lesson-schedule-page/useJpLessonSchedulePageActions.ts",
    ROOT / "src/lib/manual-schedule-sync-linked-lesson.ts",
]
RULE = ROOT / ".cursor/rules/jp-lesson-schedule-api-json.mdc"
API_JSON = ROOT / "src/lib/api-json.ts"
SWR = ROOT / "src/lib/client-swr-cache.ts"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not RULE.is_file():
        fail(f"missing {RULE.relative_to(ROOT)}")

    api_json = API_JSON.read_text(encoding="utf-8")
    if "export function formatCaughtApiError" not in api_json:
        fail("api-json.ts must export formatCaughtApiError")
    if "Failed to execute" not in api_json:
        fail("sanitizeApiClientError must catch Failed to execute 'json'")

    swr = SWR.read_text(encoding="utf-8")
    if 'trimmed.startsWith("<!DOCTYPE")' not in swr:
        fail("client-swr-cache must treat HTML bodies as busy, not dump DOCTYPE")

    for path in FILES:
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")
        text = path.read_text(encoding="utf-8")
        if "await res.json()" in text or ".json() as" in text:
            fail(f"{path.relative_to(ROOT)} must not call res.json() (use readApiJson)")
        if "readApiJson" not in text and path.name != "JpLessonSchedulePage.tsx":
            fail(f"{path.relative_to(ROOT)} must import readApiJson")

    page = FILES[1].read_text(encoding="utf-8")
    if "formatCaughtApiError" not in page:
        fail("JpLessonSchedulePage catch must use formatCaughtApiError")
    actions = FILES[2].read_text(encoding="utf-8")
    if "formatCaughtApiError" not in actions:
        fail("useJpLessonSchedulePageActions catch must use formatCaughtApiError")
    manual = FILES[0].read_text(encoding="utf-8")
    if "parseManualScheduleResponse" not in manual:
        fail("jp-lesson-manual-schedule must keep parseManualScheduleResponse")
    if "readApiJson" not in manual.split("parseManualScheduleResponse", 1)[1].split(
        "function coerceJpLessonManualSchedule", 1
    )[0]:
        fail("parseManualScheduleResponse must use readApiJson")

    routing = (ROOT / "docs/ROUTING.md").read_text(encoding="utf-8")
    if "GET|POST /api/jp-lesson/schedule" in routing:
        fail("ROUTING.md must not list nonexistent /api/jp-lesson/schedule (HTML 404)")
    if "/api/jp-lesson?view=schedule" not in routing:
        fail("ROUTING.md must list GET /api/jp-lesson?view=schedule")
    if "/api/jp-lesson/manual-schedules" not in routing:
        fail("ROUTING.md must list /api/jp-lesson/manual-schedules")

    print("check_jp_lesson_schedule_api_json OK")


if __name__ == "__main__":
    main()
