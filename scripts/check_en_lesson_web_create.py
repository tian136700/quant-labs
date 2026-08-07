#!/usr/bin/env python3
"""Regression: /en-lesson 网页新增 — create 路由会话鉴权 + 弹窗 kind/中文语法提示."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CREATE_ROUTE = ROOT / "src/app/api/en-lesson/create/route.ts"
UPLOAD_ROUTE = ROOT / "src/app/api/en-lesson/upload/route.ts"
HELPER = ROOT / "src/lib/en-lesson-create-with-file.ts"
MODAL = ROOT / "src/components/en-lesson-page/EnLessonCreateModal.tsx"
HEADER = ROOT / "src/components/en-lesson-page/EnLessonPageHeader.tsx"
PAGE = ROOT / "src/components/EnLessonPage.tsx"
DOCS = ROOT / "docs/en-lesson-create-api.txt"


def main() -> int:
    errors: list[str] = []

    create = CREATE_ROUTE.read_text(encoding="utf-8")
    if "requireEnLessonOperate" not in create:
        errors.append("create/route: must use requireEnLessonOperate")
    if "verifyUploadAuth" in create:
        errors.append("create/route: must NOT use upload Bearer auth")
    if "createEnLessonWithOptionalFile" not in create:
        errors.append("create/route: must call createEnLessonWithOptionalFile")

    upload = UPLOAD_ROUTE.read_text(encoding="utf-8")
    if "verifyUploadAuth" not in upload:
        errors.append("upload/route: must keep verifyUploadAuth")
    if "createEnLessonWithOptionalFile" not in upload:
        errors.append("upload/route: must share createEnLessonWithOptionalFile")

    helper = HELPER.read_text(encoding="utf-8")
    if "export async function createEnLessonWithOptionalFile" not in helper:
        errors.append("helper: missing createEnLessonWithOptionalFile")

    modal = MODAL.read_text(encoding="utf-8")
    if 'value="grammar"' not in modal or 'value="word"' not in modal:
        errors.append("CreateModal: must offer word/grammar kind radios")
    if "定语从句" not in modal:
        errors.append("CreateModal: must hint Chinese grammar names (定语从句)")
    if "备注" not in modal:
        errors.append("CreateModal: must have 备注 field")
    if "pickClipboardLessonFile" not in modal and "onPaste" not in modal:
        errors.append("CreateModal: must support paste for lesson file")
    if "en-lesson-create-paste-zone" not in modal:
        errors.append("CreateModal: must have paste zone (like JP lesson)")
    if "点击放大预览" not in modal or "en-lesson-create-zoom" not in modal:
        errors.append("CreateModal: image preview must be clickable to zoom (like JP)")
    if "en-lesson-create-thumb" not in modal:
        errors.append("CreateModal: preview thumb must be centered/clickable")
    if 'type="file"' not in modal:
        errors.append("CreateModal: must allow file upload")
    if "/api/en-lesson/create" not in modal:
        errors.append("CreateModal: must POST /api/en-lesson/create")
    if "JpVocabSaveProgressBar" not in modal:
        errors.append("CreateModal: must show save progress bar")

    paste_helper = ROOT / "src/lib/en-lesson-create-paste.ts"
    if not paste_helper.is_file():
        errors.append("missing en-lesson-create-paste.ts")
    else:
        paste = paste_helper.read_text(encoding="utf-8")
        if "application/pdf" not in paste:
            errors.append("paste helper: must accept PDF as well as images")

    db = (ROOT / "src/lib/en-lesson-db.ts").read_text(encoding="utf-8")
    if "ensureEnLessonRemarksColumn" not in db or "remarks" not in db:
        errors.append("en-lesson-db: must persist remarks column")

    header = HEADER.read_text(encoding="utf-8")
    if "新增" not in header:
        errors.append("PageHeader: missing 新增 button")

    page = PAGE.read_text(encoding="utf-8")
    modals = (
        ROOT / "src/components/en-lesson-page/EnLessonPageModals.tsx"
    ).read_text(encoding="utf-8")
    wired = (
        "EnLessonCreateBridge" in page
        or "EnLessonCreateModal" in page
        or (
            "EnLessonPageModals" in page
            and "EnLessonCreateBridge" in modals
        )
    )
    if not wired:
        errors.append("EnLessonPage: must wire create modal/bridge")

    if not DOCS.is_file():
        errors.append("missing docs/en-lesson-create-api.txt")
    else:
        docs = DOCS.read_text(encoding="utf-8")
        if "/api/en-lesson/create" not in docs:
            errors.append("docs: must document /api/en-lesson/create")
        if "en_lesson:operate" not in docs:
            errors.append("docs: must mention en_lesson:operate")
        if "remarks" not in docs:
            errors.append("docs: must document remarks field")

    if errors:
        print("\n".join(errors))
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
