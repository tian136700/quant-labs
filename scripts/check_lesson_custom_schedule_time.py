#!/usr/bin/env python3
"""Regression: lesson schedule save/compare must not snap to half-hour."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SHARED = [
    ROOT / "src/lib/jp-lesson-shared.ts",
    ROOT / "src/lib/en-lesson-shared.ts",
]

PICKERS = [
    ROOT / "src/components/JpLessonHalfHourTimeGridPicker.tsx",
    ROOT / "src/components/EnLessonHalfHourTimeGridPicker.tsx",
]

FORBIDDEN_IN_SHARED = [
    re.compile(
        r"export function (?:splitNextClassAtLocalValue|nextClassAtFromDatetimeLocalValue|normalizeClassAtForCompare)\([\s\S]*?snapNextClassTimeToHalfHour",
        re.M,
    ),
]


def main() -> int:
    errors: list[str] = []

    for path in SHARED:
        text = path.read_text(encoding="utf-8")
        if "export function normalizeNextClassTimeHm" not in text:
            errors.append(f"{path.relative_to(ROOT)}: missing normalizeNextClassTimeHm")
        for fn in (
            "splitNextClassAtLocalValue",
            "nextClassAtFromDatetimeLocalValue",
            "normalizeClassAtForCompare",
        ):
            # Extract function body roughly until next export function
            m = re.search(
                rf"export function {fn}\([\s\S]*?(?=export function |\Z)",
                text,
            )
            if not m:
                errors.append(f"{path.relative_to(ROOT)}: missing {fn}")
                continue
            body = m.group(0)
            if "snapNextClassTimeToHalfHour" in body:
                errors.append(
                    f"{path.relative_to(ROOT)}: {fn} must not call snapNextClassTimeToHalfHour"
                )
            if fn != "normalizeClassAtForCompare" and "normalizeNextClassTimeHm" not in body:
                errors.append(
                    f"{path.relative_to(ROOT)}: {fn} should use normalizeNextClassTimeHm"
                )

    for path in PICKERS:
        text = path.read_text(encoding="utf-8")
        if "自定义时间" not in text:
            errors.append(f"{path.relative_to(ROOT)}: missing 自定义时间 UI")
        if 'type="time"' in text:
            errors.append(f"{path.relative_to(ROOT)}: do not use type=time (may expose seconds)")
        if re.search(r'aria-label="秒"|秒\s*</', text):
            errors.append(f"{path.relative_to(ROOT)}: must not expose seconds picker")

    if errors:
        print("check_lesson_custom_schedule_time FAILED:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("check_lesson_custom_schedule_time OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
