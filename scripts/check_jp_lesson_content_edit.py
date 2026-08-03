#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 日语新课可编辑学习内容/释义（成对行 → 入库拆解）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    edit_lib = (ROOT / "src/lib/jp-lesson-content-edit.ts").read_text(encoding="utf-8")
    for needle in (
        "formatJpLessonContentForEdit",
        "formatJpLessonMeaningsForEdit",
        "buildJpLessonContentMeaningsFromEdit",
        "parseJpLessonNumberedEditLines",
        "buildJpLessonContentEditRows",
        "buildJpLessonContentMeaningsFromRows",
        "createEmptyJpLessonContentEditRow",
    ):
        if needle not in edit_lib:
            errors.append(f"missing {needle} in jp-lesson-content-edit.ts")

    db = (ROOT / "src/lib/jp-lesson-db-content.ts").read_text(encoding="utf-8")
    if "updateJpLessonContentMeanings" not in db:
        errors.append("missing updateJpLessonContentMeanings")

    route = (ROOT / "src/app/api/jp-lesson/route.ts").read_text(encoding="utf-8")
    if 'action === "set_content"' not in route and "action === 'set_content'" not in route:
        errors.append('API must handle action "set_content"')

    modal = (ROOT / "src/components/JpLessonContentEditModal.tsx").read_text(
        encoding="utf-8"
    )
    if "学习内容" not in modal or "释义" not in modal:
        errors.append("modal must show 学习内容 + 释义")
    if "JpVocabSaveProgressBar" not in modal:
        errors.append("modal must use JpVocabSaveProgressBar")
    if "buildJpLessonContentEditRows" not in modal:
        errors.append("modal must open with paired rows")
    if "buildJpLessonContentMeaningsFromRows" not in modal:
        errors.append("modal must save from paired rows")
    if "删除" not in modal or "window.confirm" not in modal:
        errors.append("modal must allow per-row delete with confirm")
    if "删除所选" not in modal:
        errors.append("modal must allow multi-select batch delete")
    if "keepOpen" not in modal or "删除后会立即保存" not in modal:
        errors.append("delete must auto-save with keepOpen (no manual save step)")
    save_helper = (
        ROOT / "src/components/jp-lesson-page/saveJpLessonContentMeanings.ts"
    ).read_text(encoding="utf-8")
    if "keepOpen" not in save_helper:
        errors.append("saveJpLessonContentMeanings must support keepOpen")
    if 'type="checkbox"' not in modal and "type='checkbox'" not in modal:
        errors.append("modal must have row checkboxes for multi-select")
    if "添加一项" not in modal:
        errors.append("modal must allow adding a row")
    if "标完成" not in modal or "标所选完成" not in modal:
        errors.append("modal must support mark-complete per row and batch")
    if "onCompleteItems" not in modal:
        errors.append("modal must accept onCompleteItems callback")
    if "isJpLessonContentEditRowsDirty" not in edit_lib:
        errors.append("edit lib must detect unsaved rows before mark-complete")
    # 标完成拦截提示必须在标题区（非滚动列表底），否则词多时像没反应
    header_idx = modal.find('className="jp-lesson-content-edit-header"')
    body_idx = modal.find('className="jp-lesson-content-edit-body"')
    error_idx = modal.find('className="jp-lesson-content-edit-error"')
    if header_idx < 0 or body_idx < 0 or error_idx < 0:
        errors.append("modal must have header/body/error regions")
    elif not (header_idx < error_idx < body_idx):
        errors.append(
            "complete/save localError must render in header (above scroll body)"
        )
    if "有未保存的修改，请先点「保存」，再标完成" not in modal:
        errors.append("modal must explain dirty rows block mark-complete")
    # 禁止退回双大框靠行号对齐
    if 'className="jp-lesson-content-edit-textarea"' in modal:
        errors.append("modal must not use dual textareas for content/meanings")

    table = (ROOT / "src/components/jp-lesson-page/JpLessonStatusTable.tsx").read_text(
        encoding="utf-8"
    )
    if "onEditContent" not in table:
        errors.append("StatusTable must wire onEditContent")
    if "JpLessonContentEditIconButton" not in table:
        errors.append("StatusTable must show 编辑内容 button")

    if "join(\", \")" not in edit_lib and 'join(", ")' not in edit_lib:
        errors.append("content edit must join with comma for storage")
    if 'join("|")' not in edit_lib:
        errors.append("meanings edit must join with | for storage")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson content edit guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
