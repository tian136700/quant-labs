#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 新课学习内容/释义过长必须能「更多 / 收起」。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPERS = ROOT / "src/components/jp-lesson-page/jp-lesson-page-helpers.tsx"
STYLES = ROOT / "src/components/jp-lesson-page/JpLessonPageStyles.tsx"


def main() -> int:
    errors: list[str] = []
    text = HELPERS.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")

    if "jpLessonPreviewNeedsMore" not in text:
        errors.append("missing jpLessonPreviewNeedsMore helper")
    if "JP_LESSON_PREVIEW_CHAR_BUDGET" not in text:
        errors.append("must use char budget so long single-line 释义 can collapse")
    m = re.search(r"JP_LESSON_CONTENT_PREVIEW_ITEMS\s*=\s*(\d+)", text)
    if not m or int(m.group(1)) > 3:
        errors.append("PREVIEW_ITEMS should be ≤3 (6 items in 2 lines used to hide 更多)")
    if "is-collapse" not in text:
        errors.append("collapse button needs is-collapse class")
    if "expanded ? moreBtn" not in text.replace(" ", ""):
        # allow whitespace variants
        if not re.search(r"expanded\s*\?\s*moreBtn", text):
            errors.append("expanded state must render 收起 button above content")
    if "is-collapse" not in styles or "position: sticky" not in styles:
        errors.append("Styles must sticky-position collapse button")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson preview collapse guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
