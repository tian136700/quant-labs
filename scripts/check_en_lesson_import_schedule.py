#!/usr/bin/env python3
"""回归：英语新课「引入日程」— 仅英语未上完手动日程 + 时间合并追加。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LIB = ROOT / "src/lib/en-lesson-import-schedule.ts"
SYNC = ROOT / "src/lib/manual-schedule-sync-linked-lesson.ts"
TABLE = ROOT / "src/components/en-lesson-page/EnLessonStatusTable.tsx"
HOOK = ROOT / "src/components/en-lesson-page/useEnLessonImportSchedule.ts"
MODAL = ROOT / "src/components/en-lesson-page/EnLessonImportScheduleModal.tsx"
BRIDGE = ROOT / "src/components/en-lesson-page/EnLessonImportScheduleBridge.tsx"
PAGE = ROOT / "src/components/EnLessonPage.tsx"
FEATURE = ROOT / "docs/feature-index.md"
RULE = ROOT / ".cursor/rules/en-lesson-import-schedule.mdc"


def main() -> int:
    errors: list[str] = []

    for path in (LIB, SYNC, TABLE, HOOK, MODAL, BRIDGE, PAGE, RULE):
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")

    lib = LIB.read_text(encoding="utf-8") if LIB.is_file() else ""
    for needle in (
        "isEnglishManualScheduleForImport",
        "isManualScheduleNotPast",
        "filterEnLessonImportManualSchedules",
        "mergeLessonClassSchedulesAppend",
        "detectScheduleTeacherSubjectFromTitle",
        "getJpLessonScheduleEventStatus",
        "lessonHasAssignedTeachers",
    ):
        if needle not in lib:
            errors.append(f"en-lesson-import-schedule.ts must export/use {needle}")

    # 标题日语/韩语排除；英语保留
    if 'titleSubject === "jp" || titleSubject === "ko"' not in lib:
        errors.append("must exclude jp/ko title subjects")
    if 'titleSubject === "en"' not in lib:
        errors.append("must accept en title subject")

    # 合并去重逻辑：同 class_at 不重复追加
    if "normalizeClassAtForCompare" not in lib:
        errors.append("merge must compare via normalizeClassAtForCompare")
    if "seen.has(incomingKey)" not in lib and "seen.has(incomingKey)" not in lib:
        # tolerate either style
        if "incomingKey" not in lib:
            errors.append("merge must dedupe incoming class_at")

    sync = SYNC.read_text(encoding="utf-8") if SYNC.is_file() else ""
    if "mergeLessonClassSchedulesAppend" not in sync:
        errors.append("sync must merge schedules via mergeLessonClassSchedulesAppend")
    if "preserveExistingTeachers" not in sync:
        errors.append("sync must support preserveExistingTeachers")
    if "existingSchedules" not in sync:
        errors.append("sync must accept existingSchedules")
    # 禁止整表只写单条覆盖（旧行为）
    if re.search(
        r"class_schedules:\s*\[\s*\{\s*class_at:\s*classAt",
        sync,
    ):
        errors.append("sync must not replace with a single schedule only")

    table = TABLE.read_text(encoding="utf-8") if TABLE.is_file() else ""
    if "引入日程" not in table:
        errors.append("EnLessonStatusTable must show 引入日程 button")
    if "onImportSchedule" not in table:
        errors.append("EnLessonStatusTable must take onImportSchedule")

    hook = HOOK.read_text(encoding="utf-8") if HOOK.is_file() else ""
    if "preserveExistingTeachers: true" not in hook:
        errors.append("import hook must preserveExistingTeachers")
    if 'subject: "en"' not in hook:
        errors.append("import hook must link subject en")
    if "updateJpLessonManualSchedule" not in hook:
        errors.append("import hook must write linked_lessons on manual schedule")
    if "JpVocabSaveProgressBar" not in MODAL.read_text(encoding="utf-8"):
        errors.append("import modal must use JpVocabSaveProgressBar")

    page = PAGE.read_text(encoding="utf-8") if PAGE.is_file() else ""
    if "EnLessonImportScheduleBridge" not in page:
        errors.append("EnLessonPage must mount EnLessonImportScheduleBridge")
    if "onImportSchedule" not in page:
        errors.append("EnLessonPage must pass onImportSchedule to table")

    feature = FEATURE.read_text(encoding="utf-8") if FEATURE.is_file() else ""
    if "引入日程" not in feature:
        errors.append("feature-index.md must document 引入日程")

    # 纯函数行为：合并
    def merge(existing: list[tuple[str, int | None]], incoming: tuple[str, int | None]):
        seen = set()
        out: list[tuple[str, int | None]] = []
        for at, dur in existing:
            key = at.strip()
            if key in seen:
                continue
            seen.add(key)
            out.append((at, dur))
        inc_at, inc_dur = incoming
        if inc_at.strip() not in seen:
            out.append((inc_at, inc_dur))
        return out

    merged = merge(
        [("2026-08-04 08:00:00", 25)],
        ("2026-08-05 09:00:00", 25),
    )
    if len(merged) != 2:
        errors.append("merge append should keep both distinct times")
    same = merge(
        [("2026-08-04 08:00:00", 25)],
        ("2026-08-04 08:00:00", 30),
    )
    if len(same) != 1 or same[0][1] != 25:
        errors.append("merge same class_at must keep existing duration")

    if errors:
        for err in errors:
            print(f"FAIL: {err}", file=sys.stderr)
        return 1
    print("OK: en-lesson import schedule guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
