#!/usr/bin/env python3
"""回归：手动日程「长期固定」展开 / 整系列改删 / 默认非 recurring。"""

from __future__ import annotations

import re
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PURE = ROOT / "src/lib/jp-lesson-manual-schedule-recurring.ts"
DB = ROOT / "src/lib/jp-lesson-manual-schedule-db.ts"
RDB = ROOT / "src/lib/jp-lesson-manual-schedule-recurring-db.ts"
TYPES = ROOT / "src/lib/jp-lesson-manual-schedule.ts"
API = ROOT / "src/app/api/jp-lesson/manual-schedules/route.ts"
EXPAND = ROOT / "src/app/api/admin/manual-schedule-recurring-expand/route.ts"
MODAL = ROOT / "src/components/JpLessonManualScheduleModal.tsx"
ACTIONS = ROOT / "src/components/jp-lesson-schedule-page/useJpLessonSchedulePageActions.ts"
LAYOUT = ROOT / "src/components/jp-lesson-schedule-page/JpLessonScheduleLayout.tsx"
FEATURE_INDEX = ROOT / "docs/feature-index.md"
WORKER = ROOT / "cloudflare-worker.ts"
SCHEMA = ROOT / "schema.sql"
DOCS = ROOT / "docs/jp-lesson-manual-schedules-api.txt"
EXPAND_DOCS = ROOT / "docs/manual-schedule-recurring-expand-api.txt"
RULE = ROOT / ".cursor/rules/manual-schedule-recurring.mdc"


def weekday_sun0(d: date) -> int:
    # Python: Monday=0 … Sunday=6 → Sunday=0 …
    return (d.weekday() + 1) % 7


def expand(weekday: int, time_hm: str, from_ymd: str, weeks: int = 12) -> list[str]:
    y, m, d = (int(x) for x in from_ymd.split("-"))
    cur = date(y, m, d)
    for _ in range(7):
        if weekday_sun0(cur) == weekday:
            break
        cur += timedelta(days=1)
    else:
        return []
    out: list[str] = []
    for i in range(weeks):
        day = cur + timedelta(days=7 * i)
        out.append(f"{day.isoformat()} {time_hm}:00")
    return out


def main() -> int:
    errors: list[str] = []

    pure = PURE.read_text(encoding="utf-8")
    if "MANUAL_SCHEDULE_RECURRING_HORIZON_WEEKS = 12" not in pure:
        errors.append("horizon must be 12 weeks")
    if "expandRecurringClassAts" not in pure:
        errors.append("missing expandRecurringClassAts")
    if "beijingWeekdayFromDateString" not in pure:
        errors.append("missing beijingWeekdayFromDateString")
    if "formatManualScheduleRecurringBadge" not in pure:
        errors.append("missing badge helper")

    # 2026-08-09 is Sunday
    got = expand(0, "21:00", "2026-08-09", 12)
    if len(got) != 12:
        errors.append(f"expand Sunday 21:00 from 2026-08-09 → want 12 got {len(got)}")
    elif got[0] != "2026-08-09 21:00:00":
        errors.append(f"first class_at wrong: {got[0]}")
    elif got[1] != "2026-08-16 21:00:00":
        errors.append(f"second class_at wrong: {got[1]}")
    # from Monday → first Sunday is 2026-08-16
    got2 = expand(0, "21:00", "2026-08-10", 3)
    if not got2 or got2[0] != "2026-08-16 21:00:00":
        errors.append(f"align from Mon to next Sun failed: {got2[:1]}")

    types = TYPES.read_text(encoding="utf-8")
    if "recurring_id" not in types:
        errors.append("types must include recurring_id")
    if "recurring?: boolean" not in types:
        errors.append("draft must include optional recurring?: boolean")

    db = DB.read_text(encoding="utf-8")
    if "jp_lesson_manual_schedule_recurring" not in db:
        errors.append("db must create recurring rule table")
    if "recurring_id" not in db:
        errors.append("db must support recurring_id column")
    if "isSqliteDuplicateColumnError" not in db:
        errors.append("ALTER recurring_id must be idempotent")

    rdb = RDB.read_text(encoding="utf-8")
    for name in (
        "createRecurringJpLessonManualSchedule",
        "updateRecurringJpLessonManualSeries",
        "cancelRecurringJpLessonManualSeries",
        "expandActiveJpLessonManualRecurring",
        "pickManualScheduleForLinkedLessonSync",
        "createJpLessonManualScheduleMaybeRecurring",
        "updateJpLessonManualScheduleMaybeRecurring",
        "deleteJpLessonManualScheduleMaybeRecurring",
    ):
        if name not in rdb:
            errors.append(f"recurring-db missing {name}")

    # 改系列只动未来：须按今天删 future 再 insert
    if "beijingTodayDateString" not in rdb:
        errors.append("series update/cancel must use beijingTodayDateString")
    if "deleteJpLessonManualScheduleFutureByRecurringId" not in rdb:
        errors.append("series rewrite must delete future by recurring_id")

    api = API.read_text(encoding="utf-8")
    if "createJpLessonManualScheduleMaybeRecurring" not in api:
        errors.append("manual-schedules API must use maybe-recurring create")
    if "body.recurring === true" not in api:
        errors.append("API must read recurring flag (default off)")
    if "deleteJpLessonManualScheduleMaybeRecurring" not in api:
        errors.append("DELETE must cancel whole series when recurring")

    if not EXPAND.is_file():
        errors.append("missing expand admin API route")
    else:
        expand_src = EXPAND.read_text(encoding="utf-8")
        if "expandActiveJpLessonManualRecurring" not in expand_src:
            errors.append("expand API must call expandActive…")
        if "verifyUploadAuth" not in expand_src:
            errors.append("expand API must use upload token auth")

    schema = SCHEMA.read_text(encoding="utf-8")
    if "jp_lesson_manual_schedule_recurring" not in schema:
        errors.append("schema.sql must define recurring table")
    if not re.search(r"recurring_id\s+INTEGER", schema):
        errors.append("schema.sql manual schedule must have recurring_id")

    if not DOCS.is_file() or "recurring" not in DOCS.read_text(encoding="utf-8"):
        errors.append("docs/jp-lesson-manual-schedules-api.txt must document recurring")
    if not EXPAND_DOCS.is_file():
        errors.append("missing docs/manual-schedule-recurring-expand-api.txt")

    if not RULE.is_file():
        errors.append("missing .cursor/rules/manual-schedule-recurring.mdc")
    else:
        rule = RULE.read_text(encoding="utf-8")
        if "默认" not in rule or "整系列" not in rule:
            errors.append("rule must state default off + whole-series edit/delete")

    if not MODAL.is_file():
        errors.append("missing JpLessonManualScheduleModal")
    else:
        modal = MODAL.read_text(encoding="utf-8")
        if "长期固定" not in modal:
            errors.append("modal must expose 长期固定 option")
        if "setRecurring(false)" not in modal and "useState(false)" not in modal:
            errors.append("modal recurring must default false")
        if "recurring: editingIsRecurringSeries ? true : recurring" not in modal:
            errors.append("modal save must pass recurring on draft")
        if "editingIsRecurringSeries" not in modal:
            errors.append("editing series must lock / warn whole-series save")

    actions = ACTIONS.read_text(encoding="utf-8")
    if "loadManualSchedules({ force: true })" not in actions:
        errors.append("save/delete recurring must force-reload manuals")
    if "取消整条长期固定" not in actions:
        errors.append("delete confirm must warn whole-series cancel")

    layout = LAYOUT.read_text(encoding="utf-8")
    if "formatManualScheduleRecurringBadge" not in layout:
        errors.append("detail panel must show recurring badge")

    if "长期固定" not in FEATURE_INDEX.read_text(encoding="utf-8"):
        errors.append("feature-index must document 长期固定")

    worker = WORKER.read_text(encoding="utf-8")
    if "manual-schedule-recurring-expand" not in worker:
        errors.append("cloudflare-worker must call recurring expand API")
    if "hour === 3 && minute === 15" not in worker:
        errors.append("Worker must run expand once daily (BJ 03:15)")

    if errors:
        print("check_manual_schedule_recurring: FAIL")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_manual_schedule_recurring: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
