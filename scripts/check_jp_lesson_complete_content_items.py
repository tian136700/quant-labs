#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 熟悉词拆项标完成（complete_content_items + 弹窗标完成）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    lib = (ROOT / "src/lib/jp-lesson-complete-content-items.ts").read_text(
        encoding="utf-8"
    )
    for needle in (
        "completeJpLessonContentItems",
        "deleteJpLesson",
        "createJpLesson",
        "updateJpLessonProgress",
        "buildJpLessonVocabSyncPlan",
        "item_indexes",
    ):
        if needle not in lib:
            errors.append(f"missing {needle} in jp-lesson-complete-content-items.ts")

    route = (ROOT / "src/app/api/jp-lesson/route.ts").read_text(encoding="utf-8")
    if 'action === "complete_content_items"' not in route:
        errors.append('API must handle action "complete_content_items"')
    if "completeJpLessonContentItems" not in route:
        errors.append("route must call completeJpLessonContentItems")

    client = (
        ROOT / "src/components/jp-lesson-page/completeJpLessonContentItems.ts"
    ).read_text(encoding="utf-8")
    for needle in (
        "complete_content_items",
        "runJpLessonVocabSyncChunks",
        "vocab_syncs",
    ):
        if needle not in client:
            errors.append(f"missing {needle} in completeJpLessonContentItems.ts")

    edit_lib = (ROOT / "src/lib/jp-lesson-content-edit.ts").read_text(encoding="utf-8")
    for needle in (
        "isJpLessonContentEditRowsDirty",
        "resolveJpLessonContentCompleteIndexes",
    ):
        if needle not in edit_lib:
            errors.append(f"missing {needle} in jp-lesson-content-edit.ts")

    modal = (ROOT / "src/components/JpLessonContentEditModal.tsx").read_text(
        encoding="utf-8"
    )
    for needle in ("标完成", "标所选完成", "onCompleteItems"):
        if needle not in modal:
            errors.append(f"modal must support {needle}")
    if 'className="jp-lesson-content-edit-error"' not in modal:
        errors.append("modal must show complete/save errors")
    header_idx = modal.find('className="jp-lesson-content-edit-header"')
    body_idx = modal.find('className="jp-lesson-content-edit-body"')
    error_idx = modal.find('className="jp-lesson-content-edit-error"')
    if header_idx < 0 or body_idx < 0 or error_idx < 0:
        errors.append("modal missing header/body/error for complete feedback")
    elif not (header_idx < error_idx < body_idx):
        errors.append(
            "complete localError must sit in header above scroll body "
            "(otherwise long lessons look like 标完成无反应)"
        )

    page = (ROOT / "src/components/JpLessonPage.tsx").read_text(encoding="utf-8")
    if "completeLessonContentItems" not in page:
        errors.append("JpLessonPage must wire completeLessonContentItems")

    modals = (
        ROOT / "src/components/jp-lesson-page/JpLessonPageModals.tsx"
    ).read_text(encoding="utf-8")
    if "completeLessonContentItems" not in modals:
        errors.append("JpLessonPageModals must pass completeLessonContentItems")
    # 曾挂部署：props 写成 Promise<void>，而 client 返回 {ok}/error
    prop_block = modals.split("completeLessonContentItems:", 1)
    if len(prop_block) < 2:
        errors.append("JpLessonPageModals props missing completeLessonContentItems type")
    else:
        prop_ty = prop_block[1].split("handleRefUpdated", 1)[0]
        if "Promise<void>" in prop_ty and "JpLessonCompleteContentItemsResult" not in prop_ty and "{ ok: true }" not in prop_ty:
            errors.append(
                "completeLessonContentItems prop must accept Result "
                "(not only Promise<void>; next build type error)"
            )
        if "JpLessonCompleteContentItemsResult" not in prop_ty and "{ ok: true }" not in prop_ty:
            errors.append(
                "completeLessonContentItems prop must mention "
                "JpLessonCompleteContentItemsResult or { ok: true }"
            )
    if "JpLessonCompleteContentItemsResult" not in client:
        errors.append(
            "completeJpLessonContentItems.ts must export "
            "JpLessonCompleteContentItemsResult"
        )

    api_txt = (ROOT / "docs/jp-lesson-api.txt").read_text(encoding="utf-8")
    if "complete_content_items" not in api_txt:
        errors.append("docs/jp-lesson-api.txt must document complete_content_items")

    rule = (ROOT / ".cursor/rules/jp-lesson-content-edit.mdc").read_text(
        encoding="utf-8"
    )
    if "complete_content_items" not in rule:
        errors.append("jp-lesson-content-edit.mdc must mention complete_content_items")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson complete content items guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
