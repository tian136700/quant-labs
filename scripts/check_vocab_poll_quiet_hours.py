#!/usr/bin/env python3
"""Regression: vocab client polls must throttle at night + for test accounts."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_contain(path: Path, needles: list[str], label: str) -> list[str]:
    text = path.read_text(encoding="utf-8")
    missing = [n for n in needles if n not in text]
    if missing:
        return [f"{label}: missing {m!r} in {path.relative_to(ROOT)}" for m in missing]
    return []


def main() -> int:
    errors: list[str] = []

    helper = ROOT / "src/lib/vocab-poll-throttle.ts"
    errors += must_contain(
        helper,
        [
            "VOCAB_POLL_QUIET_START_HOUR_BJ = 0",
            "VOCAB_POLL_QUIET_END_HOUR_BJ = 8",
            "VOCAB_POLL_QUIET_MS = 300_000",
            'VOCAB_POLL_LOW_FREQ_USERNAMES = ["test", "user1"]',
            "resolveVocabPollIntervalMs",
            "isVocabPollQuietHours",
            "isVocabPollLowFreqUsername",
            "ensureVocabPollTodayHasClassFetched",
            "todayHasClass",
        ],
        "helper",
    )

    errors += must_contain(
        ROOT / "src/lib/vocab-poll-today-has-class.ts",
        [
            "getVocabPollTodayHasClassSync",
            "ensureVocabPollTodayHasClassFetched",
            "/api/schedule/today-has-class",
        ],
        "today-has-class-client",
    )

    errors += must_contain(
        ROOT / "src/lib/schedule-today-has-class.ts",
        [
            "beijingDateHasAnyScheduleClass",
            "jp_lesson_class_schedule",
            "en_lesson_class_schedule",
            "jp_lesson_manual_schedule",
        ],
        "today-has-class-server",
    )

    errors += must_contain(
        ROOT / "src/app/api/schedule/today-has-class/route.ts",
        ["beijingDateHasAnyScheduleClass", "getSessionUserFromRequest"],
        "today-has-class-api",
    )

    sync = ROOT / "src/lib/jp-vocab-sync.ts"
    errors += must_contain(
        sync,
        ["resolveVocabPollIntervalMs", "username: opts?.username"],
        "jp-vocab-sync",
    )
    # 曾因同一文件里 import 两次 resolveVocabPollIntervalMs 导致 next build 直接挂
    # （Identifier has already been declared）→ 自动部署失败
    for path in (
        sync,
        ROOT / "src/lib/vocab-poll-throttle.ts",
        ROOT / "src/hooks/useJpVocabPageSync.ts",
        ROOT / "src/hooks/useEnVocabPageSync.ts",
        ROOT / "src/hooks/useJpVocabTeacherQuiz.ts",
        ROOT / "src/hooks/useEnVocabTeacherQuiz.ts",
        ROOT / "src/components/JpVocabStudyPage.tsx",
        ROOT / "src/components/EnVocabStudyPage.tsx",
        ROOT / "src/components/KoPronPage.tsx",
        ROOT / "src/components/KoPronStudyPage.tsx",
    ):
        text = path.read_text(encoding="utf-8")
        n = text.count("import { resolveVocabPollIntervalMs }")
        if n > 1:
            errors.append(
                f"{path.relative_to(ROOT)}: resolveVocabPollIntervalMs imported {n} times "
                "(duplicate binding breaks next build)"
            )

    for path, needles, label in (
        (
            ROOT / "src/hooks/useJpVocabPageSync.ts",
            [
                "resolveVocabPollIntervalMs",
                "usernameRef",
                "{ username: usernameRef.current }",
                "syncPollGated",
                "teacherQuizPollActive",
            ],
            "jp-page-sync",
        ),
        (
            ROOT / "src/hooks/useEnVocabPageSync.ts",
            ["resolveVocabPollIntervalMs", "usernameRef", "syncPollGated", "teacherQuizPollActive"],
            "en-page-sync",
        ),
        (
            ROOT / "src/hooks/useJpVocabShareRequests.ts",
            ["username: usernameRef.current"],
            "share-requests",
        ),
        (
            ROOT / "src/hooks/useJpVocabTeacherQuiz.ts",
            ["resolveVocabPollIntervalMs", "usernameRef"],
            "jp-quiz-live",
        ),
        (
            ROOT / "src/hooks/useEnVocabTeacherQuiz.ts",
            ["resolveVocabPollIntervalMs", "usernameRef"],
            "en-quiz-live",
        ),
        (
            ROOT / "src/components/JpVocabStudyPage.tsx",
            ["resolveVocabPollIntervalMs", "username: user?.username"],
            "jp-study",
        ),
        (
            ROOT / "src/components/EnVocabStudyPage.tsx",
            ["resolveVocabPollIntervalMs", "username: user?.username"],
            "en-study",
        ),
        (
            ROOT / "src/components/KoPronPage.tsx",
            ["resolveVocabPollIntervalMs", "username: user.username"],
            "ko-page",
        ),
        (
            ROOT / "src/components/KoPronStudyPage.tsx",
            ["resolveVocabPollIntervalMs", "username: user.username"],
            "ko-study",
        ),
    ):
        errors += must_contain(path, needles, label)

    # Forbid bare 5s setInterval on ko pages (must use resolve helper)
    for path, label in (
        (ROOT / "src/components/KoPronPage.tsx", "ko-page"),
        (ROOT / "src/components/KoPronStudyPage.tsx", "ko-study"),
    ):
        text = path.read_text(encoding="utf-8")
        if re.search(
            r"setInterval\(\s*\(\)\s*=>\s*\{[^}]*JP_VOCAB_POLL",
            text,
            re.DOTALL,
        ):
            errors.append(f"{label}: still uses setInterval with JP_VOCAB_POLL (use resolveVocabPollIntervalMs)")

    rule = ROOT / ".cursor/rules/vocab-poll-quiet-hours.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/vocab-poll-quiet-hours.mdc")
    else:
        errors += must_contain(
            rule,
            [
                "alwaysApply: true",
                "resolveVocabPollIntervalMs",
                "00:00",
                "今日日程",
                "1027",
                "test",
                "user1",
            ],
            "rule",
        )

    hook = ROOT / ".cursor/hooks/worker-daily-request-session.py"
    errors += must_contain(
        hook,
        ["worker-daily-requests", "1027", "resolveVocabPollIntervalMs", "00:00"],
        "session-hook",
    )

    hooks_json = (ROOT / ".cursor/hooks.json").read_text(encoding="utf-8")
    if "worker-daily-request-session.py" not in hooks_json:
        errors.append("hooks.json: missing worker-daily-request-session.py in sessionStart")

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("ok: vocab poll quiet hours + test account throttle")
    return 0


if __name__ == "__main__":
    sys.exit(main())
