#!/usr/bin/env python3
"""Regression: JP/EN schedule page base CSS must be in the static globals bundle.

styled-jsx in JpLessonSchedulePageStyles was deployed but did not apply on
/jp-lesson/schedule (only mobile overrides appeared → unstyled flex layout).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOBALS = ROOT / "src" / "app" / "globals.css"
CSS = ROOT / "src" / "app" / "globals" / "globals-jp-lesson-schedule.css"
JP_STYLES = (
    ROOT
    / "src"
    / "components"
    / "jp-lesson-schedule-page"
    / "JpLessonSchedulePageStyles.tsx"
)
EN_STYLES = (
    ROOT
    / "src"
    / "components"
    / "en-lesson-schedule-page"
    / "EnLessonSchedulePageStyles.tsx"
)

MUST_HAVE = [
    r"\.jpls-header\s*\{[^}]*display\s*:\s*flex",
    r"\.jpls-toolbar\s*\{[^}]*display\s*:\s*flex",
    r"\.jpls-date-nav\s*\{[^}]*display\s*:\s*flex",
    r"\.jpls-duration-totals\s*\{[^}]*display\s*:\s*inline-flex",
    # Element+class so specificity ≥ globals-forms `input[type=date]{width:100%}`
    # (class-only `.jpls-date-input` loses → date box overflows under ›).
    r"input\.jpls-date-input\s*\{[^}]*width\s*:",
]

# Band-aid that paints › on top of an overflowing date field (recurring layout bug).
FORBIDDEN = [
    r"\.jpls-date-nav\s*>\s*\.jpls-icon-btn[^\{]*\{[^}]*z-index\s*:",
]


def main() -> int:
    errs: list[str] = []
    g = GLOBALS.read_text(encoding="utf-8")
    if 'globals-jp-lesson-schedule.css' not in g:
        errs.append("globals.css: missing @import globals-jp-lesson-schedule.css")

    if not CSS.is_file():
        errs.append(f"missing {CSS.relative_to(ROOT)}")
    else:
        css = CSS.read_text(encoding="utf-8")
        if ":global(" in css:
            errs.append(f"{CSS.relative_to(ROOT)}: unwrap :global(...) for plain CSS")
        for pat in MUST_HAVE:
            if not re.search(pat, css, re.S):
                errs.append(
                    f"{CSS.relative_to(ROOT)}: missing required rule matching {pat}"
                )
        for pat in FORBIDDEN:
            if re.search(pat, css, re.S):
                errs.append(
                    f"{CSS.relative_to(ROOT)}: forbidden stacking patch matching {pat} "
                    "(fix width/overflow instead of z-index over the date field)"
                )

    for path in (JP_STYLES, EN_STYLES):
        text = path.read_text(encoding="utf-8")
        if "<style" in text or "jpls-toolbar" in text:
            errs.append(
                f"{path.relative_to(ROOT)}: must stay a no-op; "
                "schedule CSS belongs in globals-jp-lesson-schedule.css"
            )

    if errs:
        print("check_jp_lesson_schedule_css FAILED:")
        for e in errs:
            print(f"  - {e}")
        return 1
    print("check_jp_lesson_schedule_css OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
