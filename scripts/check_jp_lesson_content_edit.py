#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 日语新课可编辑学习内容/释义（成对行 → 入库拆解）。"""

from __future__ import annotations

import re
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
    if "onDeleteLesson" not in modal:
        errors.append("modal must support deleting entire lesson when content emptied")
    if "整条未完成课" not in modal:
        errors.append("modal must warn that wiping last item deletes the unfinished lesson")
    if "至少保留一项学习内容，不能全部删光" in modal:
        errors.append("must allow deleting last item (delete whole unfinished lesson)")
    save_helper = (
        ROOT / "src/components/jp-lesson-page/saveJpLessonContentMeanings.ts"
    ).read_text(encoding="utf-8")
    if "keepOpen" not in save_helper:
        errors.append("saveJpLessonContentMeanings must support keepOpen")
    if 'type="checkbox"' not in modal and "type='checkbox'" not in modal:
        errors.append("modal must have row checkboxes for multi-select")
    if "添加一项" not in modal:
        errors.append("modal must allow adding a row")
    if "当前共" not in modal or "jp-lesson-content-edit-word-count" not in modal:
        errors.append("modal header must show current word count")
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
    # 进度条须在标题区（表格上方），勿塞列表底
    progress_idx = modal.find("jp-lesson-content-edit-progress")
    if progress_idx < 0:
        errors.append("modal must wrap save progress above the table")
    elif not (header_idx < progress_idx < body_idx):
        errors.append(
            "save progress bar must render in header above scroll body/table"
        )
    if "JpVocabSaveProgressBar" not in modal:
        errors.append("modal must use JpVocabSaveProgressBar")
    # 禁止退回双大框靠行号对齐
    if 'className="jp-lesson-content-edit-textarea"' in modal:
        errors.append("modal must not use dual textareas for content/meanings")

    # PC：宽弹窗 + 工具栏横排；手机才竖排满宽（勿整页像手机）
    if "min(1080px" not in modal and "min(1180px" not in modal:
        errors.append("PC content-edit modal must be ~1080–1180px wide")
    if "flex-direction: row" not in modal:
        errors.append("PC content-edit toolbar must use flex-direction: row")
    toolbar_css = modal.find(".jp-lesson-content-edit-toolbar {")
    mobile_css = modal.find("@media (max-width: 767px)")
    if toolbar_css < 0 or mobile_css < 0 or not (toolbar_css < mobile_css):
        errors.append("PC toolbar styles must come before mobile @media 767px")
    elif "flex-direction: column" not in modal[mobile_css:]:
        errors.append("mobile content-edit toolbar must stack (flex-direction: column)")
    # 列表页禁止把 width:100% 绑在全局 .jp-lesson-action-btn（会泄漏进弹窗）
    page_styles = (
        ROOT / "src/components/jp-lesson-page/JpLessonPageStyles.tsx"
    ).read_text(encoding="utf-8")
    if ".jp-lesson-actions .jp-lesson-action-btn" not in page_styles:
        errors.append(
            "JpLessonPageStyles must scope width:100% to .jp-lesson-actions .jp-lesson-action-btn"
        )

    bare = re.search(
        r":global\(\.jp-lesson-action-btn\)\s*\{[^}]*width:\s*100%",
        page_styles,
        re.DOTALL,
    )
    if bare:
        errors.append(
            "JpLessonPageStyles must not set width:100% on bare :global(.jp-lesson-action-btn)"
        )

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

    shared = (ROOT / "src/lib/jp-lesson-shared.ts").read_text(encoding="utf-8")
    if "isJpLessonContentSeparatorJunk" not in shared:
        errors.append("shared must export isJpLessonContentSeparatorJunk")
    if "splitLessonContentItems" not in shared:
        errors.append("shared must export splitLessonContentItems for meaning align")
    if "isJpLessonContentSeparatorJunk" not in edit_lib:
        errors.append("content edit must drop separator junk rows on save")
    # 纯横线 / 长音「ー」不得当词条入库
    junk_filter = (
        "isJpLessonContentSeparatorJunk" in shared
        and "parseLessonContent" in shared
        and "filter" in shared[shared.find("export function parseLessonContent") : shared.find("export function parseLessonContent") + 400]
    )
    if not junk_filter:
        errors.append("parseLessonContent must filter separator junk")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson content edit guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
