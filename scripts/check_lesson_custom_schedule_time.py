#!/usr/bin/env python3
"""Regression: lesson schedule time = HM dual-select; save must not snap to half-hour."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SHARED = [
    ROOT / "src/lib/jp-lesson-shared.ts",
    ROOT / "src/lib/en-lesson-shared.ts",
]

PICKER = ROOT / "src/components/LessonHmTimeSelect.tsx"
ALIASES = [
    ROOT / "src/components/JpLessonHalfHourTimeGridPicker.tsx",
    ROOT / "src/components/EnLessonHalfHourTimeGridPicker.tsx",
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

    if not PICKER.is_file():
        errors.append("missing LessonHmTimeSelect.tsx")
    else:
        text = PICKER.read_text(encoding="utf-8")
        if 'aria-label="小时"' not in text or 'aria-label="分钟"' not in text:
            errors.append(f"{PICKER.relative_to(ROOT)}: missing hour/minute dual selects")
        if '"00"' not in text or '"05"' not in text or '"15"' not in text or '"40"' not in text:
            errors.append(
                f"{PICKER.relative_to(ROOT)}: minute options should include 00/05/15/…/40 (5-min steps)"
            )
        if "凌晨" not in text:
            errors.append(f"{PICKER.relative_to(ROOT)}: early-morning hours should be grouped")
        if 'type="time"' in text:
            errors.append(f"{PICKER.relative_to(ROOT)}: do not use type=time (may expose seconds)")
        if re.search(r'aria-label="秒"|秒\s*</', text):
            errors.append(f"{PICKER.relative_to(ROOT)}: must not expose seconds picker")
        if "jp-lesson-time-grid-tile" in text:
            errors.append(
                f"{PICKER.relative_to(ROOT)}: half-hour grid tiles must not be primary UI"
            )

    for path in ALIASES:
        text = path.read_text(encoding="utf-8")
        if "LessonHmTimeSelect" not in text:
            errors.append(f"{path.relative_to(ROOT)}: should re-export LessonHmTimeSelect")

    if errors:
        print("check_lesson_custom_schedule_time FAILED:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("check_lesson_custom_schedule_time OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
