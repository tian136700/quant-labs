#!/usr/bin/env python3
"""Regression: 日语新课课堂笔记贴图后须自动保存，且 dirty 时禁止 initFields / 慢 GET 冲掉草稿。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTES = ROOT / "src/components/JpLessonNotesPage.tsx"


def main() -> int:
    errors: list[str] = []
    text = NOTES.read_text(encoding="utf-8")

    for needle in (
        "dirtyItemsRef",
        "loadGenRef",
        "itemFieldsRef.current",
        "saveNotesRef.current(item)",
        "if (dirtyItemsRef.current.size > 0) return",
        "dirtyItemsRef.current.size === 0",
    ):
        if needle not in text:
            errors.append(f"JpLessonNotesPage.tsx missing: {needle}")

    # 禁止 initFields 无门禁地总是覆盖
    init = text.split("const initFields = useCallback", 1)[-1].split(
        "const loadData = useCallback", 1
    )[0]
    if "dirtyItemsRef" not in init:
        errors.append("initFields must skip when dirtyItemsRef is non-empty")

    # 上传成功后必须触发保存（不能只改本地 state）
    upload = text.split("const uploadNoteImage = useCallback", 1)[-1].split(
        "const handleImageFile = useCallback", 1
    )[0]
    if "saveNotesRef.current(item)" not in upload:
        errors.append("uploadNoteImage must auto-save via saveNotesRef.current(item)")

    # saveNotes 须读 ref，避免上传后立刻保存仍用旧闭包
    save = text.split("const saveNotes = useCallback", 1)[-1].split(
        "saveNotesRef.current = saveNotes", 1
    )[0]
    if "itemFieldsRef.current" not in save:
        errors.append("saveNotes must read fields from itemFieldsRef.current")

    if errors:
        print("check_jp_lesson_notes_image_persist FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("check_jp_lesson_notes_image_persist OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
