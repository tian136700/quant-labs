#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 日语新课无教案时仍有「查看」弹窗（竖排编号学习内容）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []
    modal = (ROOT / "src/components/JpLessonWordsViewModal.tsx").read_text(
        encoding="utf-8"
    )
    table = (
        ROOT / "src/components/jp-lesson-page/JpLessonStatusTable.tsx"
    ).read_text(encoding="utf-8")
    footer = (
        ROOT / "src/components/jp-lesson-page/JpLessonStatusTableMobileFooter.tsx"
    ).read_text(encoding="utf-8")

    if "JpLessonWordsViewModal" not in modal:
        errors.append("missing JpLessonWordsViewModal")
    if "jp-lesson-words-view-list" not in modal:
        errors.append("modal must vertical-number list")
    if "onViewWords" not in table:
        errors.append("StatusTable must wire onViewWords")
    if "if (!hasRefKey)" in table and "onViewWords(lesson)" not in table:
        errors.append("no-ref branch must offer 查看 → onViewWords")
    # 有教案仍用链接，不要整段改成弹窗
    if 'key="view"' not in table or "href={viewUrl}" not in table:
        errors.append("with-ref 查看 must keep教案 link")
    if "onViewWords" not in footer or "!lesson.ref_key" not in footer:
        errors.append("mobile footer: 查看 when no ref")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson words view (no-ref) guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
