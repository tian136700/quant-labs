#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regression: 日语新课未完成「做教案提示词」+ 批量挂教案。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    prompt_lib = (ROOT / "src/lib/jp-lesson-ai-plan-prompt.ts").read_text(
        encoding="utf-8"
    )
    for needle in (
        "JP_LESSON_AI_PLAN_DEFAULT_PROMPT",
        "buildJpLessonAiPlanCopyText",
        "readStoredJpLessonAiPlanPrompt",
        "图片版单词教案",
        "辞書形",
        "严禁自行删减大半词表",
        "Your turn / Make a sentence / 造个句子",
        "A4 纵向",
        "生词表",
        "ai-plan-prompt-template:v2",
    ):
        if needle not in prompt_lib:
            errors.append(f"missing {needle} in jp-lesson-ai-plan-prompt.ts")

    attach = (ROOT / "src/lib/jp-lesson-ref-attach.ts").read_text(encoding="utf-8")
    for needle in (
        "attachJpLessonRefFile",
        "parseJpLessonAttachBatchIds",
        "JP_LESSON_REF_ATTACH_BATCH_MAX",
    ):
        if needle not in attach:
            errors.append(f"missing {needle} in jp-lesson-ref-attach.ts")

    route = (
        ROOT / "src/app/api/jp-lesson/ref/attach-batch/route.ts"
    ).read_text(encoding="utf-8")
    if "requireAdmin" not in route:
        errors.append("attach-batch must requireAdmin")
    if "attachJpLessonRefFile" not in route:
        errors.append("attach-batch must call attachJpLessonRefFile")

    replace = (
        ROOT / "src/app/api/jp-lesson/ref/replace/route.ts"
    ).read_text(encoding="utf-8")
    if "attachJpLessonRefFile" not in replace:
        errors.append("ref/replace must reuse attachJpLessonRefFile")

    modal = (ROOT / "src/components/JpLessonAiPlanPromptModal.tsx").read_text(
        encoding="utf-8"
    )
    for needle in (
        "做教案提示词",
        "复制单词+提示词",
        "挂到勾选课",
        "copyTextToClipboard",
        "CopyToast",
        "copy-toast--above-modal",
        "JpVocabSaveProgressBar",
        "/api/jp-lesson/ref/attach-batch",
    ):
        if needle not in modal:
            errors.append(f"modal missing {needle}")

    sections = (
        ROOT / "src/components/jp-lesson-page/JpLessonPageSections.tsx"
    ).read_text(encoding="utf-8")
    if "做教案提示词" not in sections or "onOpenAiPlanPrompt" not in sections:
        errors.append("pending toolbar must open AI plan prompt")

    content_edit = (
        ROOT / "src/components/JpLessonContentEditModal.tsx"
    ).read_text(encoding="utf-8")
    for needle in (
        "showAiPlanTools",
        "做教案提示词",
        "JpLessonContentEditAiPlanSection",
        "lesson?.id",
        "lesson?.content",
        "lesson?.meanings",
    ):
        if needle not in content_edit:
            errors.append(f"content edit modal missing {needle}")

    inline = (
        ROOT
        / "src/components/jp-lesson-page/JpLessonContentEditAiPlanSection.tsx"
    ).read_text(encoding="utf-8")
    for needle in (
        "复制单词+提示词",
        "挂到本课",
        "copyTextToClipboard",
        "CopyToast",
        "copy-toast--above-modal",
        "JpVocabSaveProgressBar",
        "/api/jp-lesson/ref/attach-batch",
    ):
        if needle not in inline:
            errors.append(f"content-edit AI plan section missing {needle}")

    docs = ROOT / "docs/jp-lesson-ref-attach-batch-api.txt"
    if not docs.is_file():
        errors.append("missing docs/jp-lesson-ref-attach-batch-api.txt")

    index = (ROOT / "docs/external-apis-for-copy.txt").read_text(encoding="utf-8")
    if "jp-lesson-ref-attach-batch-api.txt" not in index:
        errors.append("external-apis index must list attach-batch doc")

    rule = ROOT / ".cursor/rules/jp-lesson-ai-plan-prompt.mdc"
    if not rule.is_file():
        errors.append("missing jp-lesson-ai-plan-prompt.mdc")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson ai plan prompt guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
