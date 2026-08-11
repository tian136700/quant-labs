#!/usr/bin/env python3
"""回归：日程管理进页不因 checking 整页卡「验证中」，且 isAdmin 即拉数。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "src/components/JpLessonSchedulePage.tsx"
AUTH = ROOT / "src/contexts/EtrAuthProvider.tsx"
RULE = ROOT / ".cursor/rules/jp-lesson-schedule-auth-fast-open.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not PAGE.is_file():
        fail(f"missing {PAGE.relative_to(ROOT)}")
    if not RULE.is_file():
        fail(f"missing {RULE.relative_to(ROOT)}")
    if not AUTH.is_file():
        fail(f"missing {AUTH.relative_to(ROOT)}")

    text = PAGE.read_text(encoding="utf-8")
    auth = AUTH.read_text(encoding="utf-8")

    if re.search(r"if\s*\(\s*checking\s*\|\|\s*!isAdmin\s*\)", text):
        fail("JpLessonSchedulePage must not gate on `checking || !isAdmin`")

    if "if (!checking && !isAdmin)" not in text:
        fail(
            "JpLessonSchedulePage must gate AdminAuthGate with "
            "`if (!checking && !isAdmin)` (checking 时勿整页卡验证中)"
        )

    if re.search(r"if\s*\(\s*!checking\s*&&\s*isAdmin\s*\)", text):
        fail("JpLessonSchedulePage must not wait `!checking && isAdmin` before loading data")

    for name in (
        "loadManualSchedules",
        "loadLessons",
        "loadEnLessons",
    ):
        pat = rf"if\s*\(\s*isAdmin\s*\)\s*void\s+{name}\s*\("
        if not re.search(pat, text):
            fail(f"JpLessonSchedulePage must start `{name}` when isAdmin (no checking wait)")

    if "loadKoTeachers" not in text:
        fail("JpLessonSchedulePage must still define loadKoTeachers")
    if not re.search(
        r"if\s*\(\s*!manualModalOpen\s*&&\s*!linkLessonPickOpen\s*\)\s*return",
        text,
    ):
        fail(
            "loadKoTeachers may defer until manual/link modal open "
            "(must guard with !manualModalOpen && !linkLessonPickOpen)"
        )

    if "useLayoutEffect" not in auth:
        fail("EtrAuthProvider must hydrate auth cache in useLayoutEffect (before paint)")
    if re.search(
        r"useEffect\(\(\)\s*=>\s*\{[^}]*AUTH_USER_CACHE_KEY[^}]*void refresh",
        auth,
        re.S,
    ):
        # cache hydrate must not be only in useEffect (after paint → 验证中 flash)
        fail("auth cache hydrate must not rely on useEffect alone (use useLayoutEffect)")

    if "if (!kept) setUser(null)" not in auth:
        fail("auth probe catch must keep cached user on timeout/network error")

    rule = RULE.read_text(encoding="utf-8")
    if "checking || !isAdmin" not in rule:
        fail("rule must document forbidden `checking || !isAdmin`")
    if "!checking && !isAdmin" not in rule:
        fail("rule must document AdminAuthGate only when `!checking && !isAdmin`")
    if "useLayoutEffect" not in rule:
        fail("rule must mention EtrAuth useLayoutEffect cache hydrate")

    print("OK: jp-lesson schedule auth fast-open guards present")


if __name__ == "__main__":
    main()
