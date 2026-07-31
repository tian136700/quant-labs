#!/usr/bin/env python3
"""Regression: lesson phone cards stay ≤767; do NOT raise cards to 1100 (breaks desktop)."""

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
        if not re.search(r"@media\s*\(\s*max-width:\s*767px\s*\)", text):
            errors.append(
                f"{path.relative_to(ROOT)}: phone card layout must use max-width: 767px"
            )
        if re.search(r"@media\s*\(\s*max-width:\s*1100px\s*\)", text):
            errors.append(
                f"{path.relative_to(ROOT)}: MUST NOT use max-width: 1100px for cards "
                "(desktop windows under 1100 get phone grid and look broken)"
            )

    for path in STYLE_FILES:
        text = path.read_text(encoding="utf-8")
        if re.search(r"grid-template-columns:\s*repeat\(2,\s*max-content\)", text):
            errors.append(
                f"{path.relative_to(ROOT)}: actions grid should use minmax(0, 1fr) "
                "so buttons wrap/shrink instead of overlapping"
            )

    en_styles = (ROOT / "src/components/en-lesson-page/EnLessonPageStyles.tsx").read_text(
        encoding="utf-8"
    )
    if "jp-lesson-notes-col" not in en_styles or "max-width: 3.75rem" not in en_styles:
        errors.append(
            "EnLessonPageStyles: notes-col must have a tight max-width (≈3.75rem), "
            "otherwise iPad wastes space on 课堂笔记"
        )
    if "jp-lesson-complete-col" not in en_styles or "max-width: 5.5rem" not in en_styles:
        errors.append(
            "EnLessonPageStyles: complete-col must have a tight max-width (≈5.5rem), "
            "otherwise iPad wastes space on 学习状态"
        )
    if re.search(r"\.jp-lesson-complete-select[^{]*\{[^}]*min-width:\s*6\.5rem", en_styles):
        errors.append(
            "EnLessonPageStyles: complete-select must not force min-width 6.5rem on iPad"
        )

    if errors:
        print("FAIL: check_lesson_ipad_card_breakpoint.py")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: lesson cards stay ≤767; actions use minmax wrap")
    return 0


if __name__ == "__main__":
    sys.exit(main())
