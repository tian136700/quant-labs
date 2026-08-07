#!/usr/bin/env python3
"""Regression: 开课前启用老师账号 — Worker Cron 兜底 + Mac 联装 + 05/06/07 重试 + 失败 Bark。"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENABLE_TS = ROOT / "src/lib/teacher-user-schedule-enable.ts"
DISABLE_TS = ROOT / "src/lib/teacher-user-quiz-complete-disable.ts"
ROUTE_TS = ROOT / "src/app/api/admin/teacher-user-pre-class-enable/route.ts"
SHELL = ROOT / "scripts/teacher-user-pre-class-enable.sh"
SCHEDULE_SHELL = ROOT / "scripts/teacher-user-schedule-enable.sh"
SCHEDULE_SETUP = ROOT / "scripts/setup-teacher-user-schedule-enable-mac.sh"
PLIST = ROOT / "scripts/com.infoquests.teacher-user-pre-class-enable.plist.example"
SETUP = ROOT / "scripts/setup-teacher-user-pre-class-enable-mac.sh"
WORKER = ROOT / "cloudflare-worker.ts"

WITHIN_RE = re.compile(
    r"TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS\s*=\s*2\s*\*\s*60\s*\*\s*60\s*\*\s*1000"
)
RUN_RE = re.compile(r"export async function runTeacherUserPreClassEnable")
UPCOMING_RE = re.compile(r"export async function listTeacherIdsWithUpcomingClassStart")
DIRLOCK_RE = re.compile(r"dirlock_acquire")
INTERVAL_RE = re.compile(r"<integer>600</integer>")
SKIP_RE = re.compile(r"near_upcoming_or_ongoing_class")
RETRY_HOURS_RE = re.compile(
    r"TEACHER_USER_SCHEDULE_ENABLE_HOURS:-\s*05\s+06\s+07"
)


def _launchd_loaded(label: str) -> bool:
    uid = os.getuid()
    try:
        proc = subprocess.run(
            ["launchctl", "print", f"gui/{uid}/{label}"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return proc.returncode == 0


def main() -> int:
    errors: list[str] = []

    enable = ENABLE_TS.read_text(encoding="utf-8")
    types_ts = ROOT / "src/lib/teacher-user-schedule-enable-types.ts"
    internal_ts = ROOT / "src/lib/teacher-user-schedule-enable-internal.ts"
    types = types_ts.read_text(encoding="utf-8") if types_ts.is_file() else ""
    internal = internal_ts.read_text(encoding="utf-8") if internal_ts.is_file() else ""
    enable_all = "\n".join([enable, types, internal])
    disable = DISABLE_TS.read_text(encoding="utf-8")
    route = ROUTE_TS.read_text(encoding="utf-8")
    shell = SHELL.read_text(encoding="utf-8")
    schedule_shell = SCHEDULE_SHELL.read_text(encoding="utf-8")
    schedule_setup = SCHEDULE_SETUP.read_text(encoding="utf-8")
    plist = PLIST.read_text(encoding="utf-8")
    worker = WORKER.read_text(encoding="utf-8")

    if not WITHIN_RE.search(enable_all):
        errors.append("missing 2h TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS")
    if not RUN_RE.search(enable):
        errors.append("missing runTeacherUserPreClassEnable")
    if not UPCOMING_RE.search(enable):
        errors.append("missing listTeacherIdsWithUpcomingClassStart")
    if "listTeacherIdsWithOngoingClass" not in enable:
        errors.append("pre-class must also enable ongoing class (listTeacherIdsWithOngoingClass)")
    if "runTeacherUserPreClassEnable" not in route:
        errors.append("API route does not call runTeacherUserPreClassEnable")
    if not DIRLOCK_RE.search(shell):
        errors.append("shell missing dirlock_acquire (overlap lock)")
    if not INTERVAL_RE.search(plist):
        errors.append("plist StartInterval must be 600 (10 minutes)")
    if not SKIP_RE.search(disable):
        errors.append("quiz-complete-disable must skip near class")
    if "listLinkedUserIdsWithClassNearNow" not in disable:
        errors.append("quiz-complete-disable must use listLinkedUserIdsWithClassNearNow")
    if "manual_enable_suppress" not in disable:
        errors.append("quiz-complete-disable must honor manual_enable_suppress")
    if "teacherClassEndMs" not in enable and "resolveClassDurationMinutes" not in enable_all:
        errors.append("near-class window should consider class duration/end")
    if "listJpLessonTeacherNameMapByUserId" in enable_all:
        errors.append(
            "enable path must not call listJpLessonTeacherNameMapByUserId "
            "(full scan → Worker 1102); SELECT never_disable in JOIN instead"
        )
    if "never_disable" not in enable_all:
        errors.append("linked teacher SELECT must include never_disable")
    if not RETRY_HOURS_RE.search(schedule_shell):
        errors.append(
            "schedule-enable.sh must retry Beijing 05/06/07 if morning 1102 fails"
        )
    if "notify_schedule_enable_failure" not in schedule_shell:
        errors.append("schedule-enable.sh must Bark on API failure (silent fail = no open)")
    if "send_bark_push" not in schedule_shell:
        errors.append("schedule-enable.sh must call send_bark_push on failure")
    if "notify_pre_class_failure" not in shell:
        errors.append("pre-class-enable.sh must Bark on API failure")
    if "send_bark_push" not in shell:
        errors.append("pre-class-enable.sh must call send_bark_push on failure")
    if not SETUP.is_file():
        errors.append("missing setup-teacher-user-pre-class-enable-mac.sh")
    if "setup-teacher-user-pre-class-enable-mac.sh" not in schedule_setup:
        errors.append(
            "setup-teacher-user-schedule-enable-mac.sh must also install pre-class "
            "(联装，防只装 05:00)"
        )

    # 线上 Cron 兜底：Mac 漏装 / 睡眠 / 早上 1102 仍能开号（与上课 Bark 同 Worker）
    if "teacher-user-pre-class-enable" not in worker:
        errors.append(
            "cloudflare-worker.ts must Cron POST /api/admin/teacher-user-pre-class-enable"
        )
    if "PRE_CLASS_ENABLE_PATH" not in worker:
        errors.append("cloudflare-worker.ts missing PRE_CLASS_ENABLE_PATH")
    if "minute % 10" not in worker and "minute % 10 === 0" not in worker:
        errors.append("Worker Cron must run pre-class enable every 10 minutes")
    if "teacher-user-schedule-enable" not in worker:
        errors.append(
            "cloudflare-worker.ts must Cron POST /api/admin/teacher-user-schedule-enable "
            "at Beijing 05/06/07"
        )
    if "SCHEDULE_ENABLE_PATH" not in worker:
        errors.append("cloudflare-worker.ts missing SCHEDULE_ENABLE_PATH")

    en_sched = ROOT / "src/lib/teacher-user-en-schedule.ts"
    if not en_sched.is_file():
        errors.append("missing teacher-user-en-schedule.ts for EN 30min pre-class")
    else:
        en_text = en_sched.read_text(encoding="utf-8")
        if "EN_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS" not in en_text:
            errors.append("missing EN_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS")
        if "listEnTeacherIdsWithUpcomingClassStart" not in en_text:
            errors.append("missing listEnTeacherIdsWithUpcomingClassStart")
        if "never_disable" not in en_text:
            errors.append("EN linked teacher SELECT must include never_disable")
    if "listEnTeacherIdsWithUpcomingClassStart" not in enable:
        errors.append("runTeacherUserPreClassEnable must include EN upcoming class list")
    if "en_within_ms" not in enable:
        errors.append("pre-class result must expose en_within_ms")
    if 'subject: "en"' not in enable and "subject: 'en'" not in enable:
        errors.append("enableLinkedTeacherUsers must support subject en")
    if "trackEnVocabTeacherQuizDayAfterReview" not in disable and (
        "listEnVocabTeacherQuizDaysDueForDisable" not in disable
    ):
        errors.append("quiz-complete-disable must scan en_vocab_teacher_quiz_day")

    skips = (ROOT / "src/lib/lesson-teacher-subject.ts").read_text(encoding="utf-8")
    if re.search(r"return subject === [\"']en[\"']", skips):
        errors.append(
            "lessonTeacherSubjectSkipsUserAccount must not skip English "
            "(闲鱼英语抽查 needs login account)"
        )

    # 本机：已装「今日有课」则必须装且已加载「开课前 2h」
    if sys.platform == "darwin" and os.environ.get("SKIP_LAUNCHD_AGENT_CHECK") != "1":
        agents = Path.home() / "Library/LaunchAgents"
        schedule_plist = agents / "com.infoquests.teacher-user-schedule-enable.plist"
        pre_plist = agents / "com.infoquests.teacher-user-pre-class-enable.plist"
        schedule_label = "com.infoquests.teacher-user-schedule-enable"
        pre_label = "com.infoquests.teacher-user-pre-class-enable"
        if schedule_plist.is_file() and not pre_plist.is_file():
            errors.append(
                "LaunchAgent schedule-enable installed but pre-class-enable missing — "
                "run: bash scripts/setup-teacher-user-pre-class-enable-mac.sh"
            )
        if _launchd_loaded(schedule_label) and not _launchd_loaded(pre_label):
            errors.append(
                "launchctl has schedule-enable loaded but pre-class-enable not loaded — "
                "run: bash scripts/setup-teacher-user-pre-class-enable-mac.sh"
            )

    if errors:
        print("check_teacher_user_pre_class_enable: FAIL", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("check_teacher_user_pre_class_enable: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
