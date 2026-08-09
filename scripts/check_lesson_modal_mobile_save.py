#!/usr/bin/env python3
"""Regression: lesson teacher/time modals keep Save visible on mobile.

Root cause (recurring): component <style jsx> beats mobile-modals.css
specificity (.class.jsx-hash > .class), so bottom-sheet overrides never
applied — centered 94vh + overlay padding clipped the action bar.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MODALS = [
    ROOT / "src/components/EnLessonNextClassEditModal.tsx",
    ROOT / "src/components/JpLessonNextClassEditModal.tsx",
    ROOT / "src/components/EnLessonTeacherEditModal.tsx",
    ROOT / "src/components/JpLessonTeacherEditModal.tsx",
    ROOT / "src/components/JpLessonManualScheduleModal.tsx",
]

MOBILE = ROOT / "src/app/mobile/mobile-modals.css"


def main() -> int:
    errors: list[str] = []

    for path in MODALS:
        text = path.read_text(encoding="utf-8")
        if re.search(r"max-height:\s*min\(\s*94vh", text):
            errors.append(
                f"{path.name}: still uses max-height min(94vh) "
                "(clips with overlay padding)"
            )
        if "100dvh - 2rem" not in text:
            errors.append(
                f"{path.name}: modal max-height must reserve overlay "
                "padding (100dvh - 2rem)"
            )
        is_next = "NextClass" in path.name or "ManualSchedule" in path.name
        body = (
            "jp-lesson-next-class-body"
            if is_next
            else "jp-lesson-teacher-body"
        )
        actions = (
            "jp-lesson-next-class-actions"
            if is_next
            else "jp-lesson-teacher-actions"
        )
        if body not in text:
            errors.append(f"{path.name}: missing scroll body wrapper")
        if actions not in text:
            errors.append(f"{path.name}: missing actions bar")

    mobile = MOBILE.read_text(encoding="utf-8")

    checks = [
        (
            r"align-items:\s*flex-end\s*!important",
            "lesson overlays need align-items:flex-end !important",
        ),
        (
            r"\.jp-lesson-teacher-modal,\s*\n\s*\.jp-lesson-next-class-modal\s*\{[^}]*!important",
            "lesson modals need max-height/width !important (beat styled-jsx)",
        ),
        (
            r"100svh",
            "lesson modal max-height should use 100svh (stable mobile viewport)",
        ),
        (
            r"\.jp-lesson-teacher-body,\s*\n\s*\.jp-lesson-next-class-body\s*\{[^}]*overflow-y:\s*auto\s*!important",
            "teacher+next-class body must scroll (!important)",
        ),
        (
            r"\.jp-lesson-teacher-options(?:\s*,\s*\n\s*\.jp-lesson-next-class-teacher-options)?\s*\{[^}]*max-height:\s*none\s*!important",
            "teacher-options must not keep 55vh nested scroll that eats the sheet",
        ),
        (
            r"flex-shrink:\s*0\s*!important",
            "action/header bars must flex-shrink:0 !important",
        ),
    ]
    for pattern, label in checks:
        if not re.search(pattern, mobile, re.MULTILINE | re.DOTALL):
            errors.append(f"mobile-modals.css: {label}")

    if errors:
        for err in errors:
            print(err)
        return 1

    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
