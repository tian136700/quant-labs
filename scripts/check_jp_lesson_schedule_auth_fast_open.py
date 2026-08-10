#!/usr/bin/env python3
"""回归：日程管理进页不因 checking 挡已缓存 admin，且 isAdmin 即拉数。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "src/components/JpLessonSchedulePage.tsx"
RULE = ROOT / ".cursor/rules/jp-lesson-schedule-auth-fast-open.mdc"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not PAGE.is_file():
        fail(f"missing {PAGE.relative_to(ROOT)}")
    if not RULE.is_file():
        fail(f"missing {RULE.relative_to(ROOT)}")

    text = PAGE.read_text(encoding="utf-8")

    if re.search(r"if\s*\(\s*checking\s*\|\|\s*!isAdmin\s*\)", text):
        fail("JpLessonSchedulePage must not gate on `checking || !isAdmin`")

    if "if (!isAdmin)" not in text:
        fail("JpLessonSchedulePage must gate AdminAuthGate with `if (!isAdmin)` only")

    if re.search(r"if\s*\(\s*!checking\s*&&\s*isAdmin\s*\)", text):
        fail("JpLessonSchedulePage must not wait `!checking && isAdmin` before loading data")

    for name in (
        "loadManualSchedules",
        "loadLessons",
        "loadEnLessons",
        "loadKoTeachers",
    ):
        # allow `if (isAdmin) void loadX(...);`
        pat = rf"if\s*\(\s*isAdmin\s*\)\s*void\s+{name}\s*\("
        if not re.search(pat, text):
            fail(f"JpLessonSchedulePage must start `{name}` when isAdmin (no checking wait)")

    if "useEtrAuth()" in text and re.search(
        r"const\s*\{[^}]*\bchecking\b[^}]*\}\s*=\s*useEtrAuth\(\)", text
    ):
        fail("JpLessonSchedulePage should not destructure unused checking from useEtrAuth")

    rule = RULE.read_text(encoding="utf-8")
    if "checking || !isAdmin" not in rule:
        fail("rule must document forbidden `checking || !isAdmin`")
    if "!checking && isAdmin" not in rule:
        fail("rule must document forbidden `!checking && isAdmin` load gate")

    print("OK: jp-lesson schedule auth fast-open guards present")


if __name__ == "__main__":
    main()
