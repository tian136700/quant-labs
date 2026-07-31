#!/usr/bin/env python3
"""Regression: jp/en-lesson card layout must cover 9.7\" iPad (≤1100px), not stop at 767."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MOBILE_FILES = [
    ROOT / "src/app/mobile/mobile-jp-lesson.css",
    ROOT / "src/app/mobile/mobile-jp-lesson-cards.css",
]
STYLE_FILES = [
    ROOT / "src/components/en-lesson-page/EnLessonPageStyles.tsx",
    ROOT / "src/components/jp-lesson-page/JpLessonPageStyles.tsx",
]


def main() -> int:
    errors: list[str] = []

    for path in MOBILE_FILES:
        text = path.read_text(encoding="utf-8")
        if "@media (max-width: 1100px)" not in text:
            errors.append(f"{path.relative_to(ROOT)}: need @media (max-width: 1100px) for iPad cards")
        if re.search(r"@media\s*\(\s*max-width:\s*767px\s*\)", text):
            errors.append(
                f"{path.relative_to(ROOT)}: still uses max-width: 767px "
                "(9.7\" iPad is 768px and would get broken desktop table)"
            )

    for path in STYLE_FILES:
        text = path.read_text(encoding="utf-8")
        if "@media (min-width: 1101px)" not in text:
            errors.append(
                f"{path.relative_to(ROOT)}: sticky thead should use min-width: 1101px "
                "(only when desktop table is shown)"
            )
        if re.search(r"grid-template-columns:\s*repeat\(2,\s*max-content\)", text):
            errors.append(
                f"{path.relative_to(ROOT)}: actions grid should use minmax(0, 1fr) "
                "so buttons wrap/shrink instead of overlapping"
            )

    if errors:
        print("FAIL: check_lesson_ipad_card_breakpoint.py")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: lesson card breakpoint covers ≤1100px (9.7\" iPad)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
