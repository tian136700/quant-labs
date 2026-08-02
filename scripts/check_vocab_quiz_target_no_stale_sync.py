#!/usr/bin/env python3
"""Regression: daily quiz target must not bounce via stale sync cache."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    en_sync = read(ROOT / "src/app/api/en-vocab/sync/route.ts")
    if "bypassCache: true" not in en_sync:
        errors.append("en-vocab/sync must call getEnVocabTeacherVisibleLimit(..., { bypassCache: true })")

    jp_sync = read(ROOT / "src/app/api/jp-vocab/sync/route.ts")
    if "bypassCache: true" not in jp_sync:
        errors.append("jp-vocab/sync must call getJpVocabTeacherVisibleLimit(..., { bypassCache: true })")

    en_tv = read(ROOT / "src/app/api/en-vocab/teacher-visible/route.ts")
    if "bypassCache: true" not in en_tv:
        errors.append(
            "en-vocab/teacher-visible must call getEnVocabTeacherVisibleLimit(..., { bypassCache: true })"
        )

    jp_tv = read(ROOT / "src/app/api/jp-vocab/teacher-visible/route.ts")
    if "bypassCache: true" not in jp_tv:
        errors.append(
            "jp-vocab/teacher-visible must call getJpVocabTeacherVisibleLimit(..., { bypassCache: true })"
        )

    en_daily = read(ROOT / "src/lib/en-vocab-db/daily_settings.ts")
    if "opts?.bypassCache" not in en_daily and "!opts?.bypassCache" not in en_daily:
        errors.append("getEnVocabTeacherVisibleLimit must honor bypassCache")

    jp_daily = read(ROOT / "src/lib/jp-vocab-db/daily_settings.ts")
    if "opts?.bypassCache" not in jp_daily and "!opts?.bypassCache" not in jp_daily:
        errors.append("getJpVocabTeacherVisibleLimit must honor bypassCache")

    en_vis = read(ROOT / "src/lib/en-vocab-teacher-visible.ts")
    if "shouldRejectStaleEnVocabTeacherVisibleLimit" not in en_vis:
        errors.append("missing shouldRejectStaleEnVocabTeacherVisibleLimit")

    jp_vis = read(ROOT / "src/lib/jp-vocab-teacher-visible.ts")
    if "shouldRejectStaleJpVocabTeacherVisibleLimit" not in jp_vis:
        errors.append("missing shouldRejectStaleJpVocabTeacherVisibleLimit")

    en_page_sync = read(ROOT / "src/hooks/useEnVocabPageSync.ts")
    if "shouldRejectStaleEnVocabTeacherVisibleLimit" not in en_page_sync:
        errors.append("useEnVocabPageSync must reject stale teacher_visible_limit")
    if "trustRemote: true" not in en_page_sync:
        errors.append(
            "useEnVocabPageSync teacher-visible sync must trustRemote (override local SWR stale target)"
        )

    jp_page_sync = read(ROOT / "src/hooks/useJpVocabPageSync.ts")
    if "shouldRejectStaleJpVocabTeacherVisibleLimit" not in jp_page_sync:
        errors.append("useJpVocabPageSync must reject stale teacher_visible_limit")
    if "trustRemote: true" not in jp_page_sync:
        errors.append(
            "useJpVocabPageSync teacher-visible sync must trustRemote (override local SWR stale target)"
        )

    en_admin = read(ROOT / "src/hooks/useEnVocabAdminActions.ts")
    if "if (settingQuizTarget) return;" not in en_admin:
        errors.append("useEnVocabAdminActions must not reset input while settingQuizTarget")
    if "禁止乐观更新" not in en_admin and "等接口成功后再改" not in en_admin:
        # soft: comment may vary; ensure we don't set limit before fetch
        before_fetch = en_admin.split("await fetch(\"/api/en-vocab\"")[0]
        if "setTeacherVisibleLimit(" in before_fetch.split("const setDailyQuizTarget")[-1]:
            errors.append("useEnVocabAdminActions must not optimistically setTeacherVisibleLimit before fetch")

    jp_admin = read(ROOT / "src/hooks/useJpVocabAdminActions.ts")
    if "if (settingQuizTarget) return;" not in jp_admin:
        errors.append("useJpVocabAdminActions must not reset input while settingQuizTarget")

    if errors:
        print("check_vocab_quiz_target_no_stale_sync FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_vocab_quiz_target_no_stale_sync OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
