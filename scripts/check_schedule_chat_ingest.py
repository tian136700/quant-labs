#!/usr/bin/env python3
"""Regression: schedule-chat-ingest dual-auth + route wiring."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    auth = (ROOT / "src/lib/admin-or-upload-auth.ts").read_text(encoding="utf-8")
    if "requireAdminOrUploadToken" not in auth or "verifyUploadAuth" not in auth:
        fail("admin-or-upload-auth.ts missing dual auth helper")

    ingest = (ROOT / "src/lib/schedule-chat-ingest.ts").read_text(encoding="utf-8")
    for needle in (
        "ingestScheduleChatDraft",
        "createKoLessonTeacher",
        "createJpLessonManualSchedule",
        "detectScheduleTeacherSubjectFromTitle",
        "teacher_ambiguous",
        "schedule_already_exists",
        "listJpLessonManualSchedules",
    ):
        if needle not in ingest:
            fail(f"schedule-chat-ingest.ts missing {needle}")

    route = (
        ROOT / "src/app/api/admin/schedule-chat-ingest/route.ts"
    ).read_text(encoding="utf-8")
    if "requireAdminOrUploadToken" not in route:
        fail("schedule-chat-ingest route must use requireAdminOrUploadToken")
    if "schedule_already_exists" not in route:
        fail("route must return schedule_already_exists")
    manual = (
        ROOT / "src/app/api/jp-lesson/manual-schedules/route.ts"
    ).read_text(encoding="utf-8")
    if "requireAdminOrUploadToken" not in manual:
        fail("manual-schedules must accept upload token")

    for subject in ("ko", "jp", "en"):
        p = ROOT / f"src/app/api/admin/{subject}-lesson-teachers/route.ts"
        text = p.read_text(encoding="utf-8")
        if "requireAdminOrUploadToken" not in text:
            fail(f"{p.name} must accept upload token for list/create")
        if "viaUploadToken && body.action" not in text:
            fail(f"{p.name} must block create_user/update via upload token")

    print("OK: schedule-chat-ingest dual-auth wiring")


if __name__ == "__main__":
    main()
