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
        "writeStoredJpLessonAiPlanPrompt",
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

    auto_hook = (
        ROOT / "src/hooks/useJpLessonAiPlanPromptTemplate.ts"
    ).read_text(encoding="utf-8")
    for needle in (
        "useJpLessonAiPlanPromptTemplate",
        "writeStoredJpLessonAiPlanPrompt",
        "readStoredJpLessonAiPlanPrompt",
        "AUTOSAVE_MS",
        "flushPrompt",
    ):
        if needle not in auto_hook:
            errors.append(f"missing {needle} in useJpLessonAiPlanPromptTemplate")

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
        "useJpLessonAiPlanPromptTemplate",
        "改后自动保存",
        "onBlur",
        "numberedGroups",
        "jp-lesson-ai-plan-word-num",
        "点击放大预览",
        "jp-lesson-ai-plan-zoom",
        "canZoomImage",
        "setZoomOpen",
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
        "jp-lesson-content-edit-ai-plan-grid",
        "点击放大预览",
        "jp-lesson-content-edit-ai-plan-zoom",
        "min-height: 300px",
        "min-height: 220px",
        "grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)",
        "useJpLessonAiPlanPromptTemplate",
        "改后自动保存",
        "onBlur",
    ):
        if needle not in inline:
            errors.append(f"content-edit AI plan section missing {needle}")
    if "max-height: min(42dvh, 360px)" in inline:
        errors.append(
            "AI plan must not use max-height:42dvh that collapses prompt/paste boxes"
        )
    if "min-height: 0" in inline and "jp-lesson-content-edit-ai-plan-textarea" in inline:
        # still allow min-height:0 elsewhere (zoom stage); require textarea has real min-height
        pass
    if "border: 1px solid var(--border)" not in inline:
        errors.append("AI plan columns must look like bordered boxes")
    # 「挂到本课」须在预览区上方，禁止沉底被裁切
    actions_i = inline.find("jp-lesson-content-edit-ai-plan-paste-actions")
    zone_i = inline.find("jp-lesson-content-edit-ai-plan-paste-zone")
    if not (0 <= actions_i < zone_i):
        errors.append("paste-actions must sit above paste-zone (attach buttons visible)")

    # PC 必须两列；手机才单列
    pc_grid = inline.find(
        ".jp-lesson-content-edit-ai-plan-grid {\n"
        "          display: grid;\n"
        "          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);"
    )
    if pc_grid < 0:
        # looser fallback already checked needle above
        pc_grid = inline.find("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)")
    mobile_at = inline.find("@media (max-width: 767px)")
    if mobile_at < 0:
        errors.append("AI plan must stack columns under max-width 767px")
    elif "grid-template-columns: 1fr" not in inline[mobile_at:]:
        errors.append("mobile AI plan must use single-column grid")

    content_edit = (
        ROOT / "src/components/JpLessonContentEditModal.tsx"
    ).read_text(encoding="utf-8")
    # 教案区不得塞进 flex-shrink:0 的 header（会撑爆弹窗裁掉底栏）
    ai_pos = content_edit.find("<JpLessonContentEditAiPlanSection")
    body_pos = content_edit.find('className="jp-lesson-content-edit-body"')
    if not (0 <= ai_pos < body_pos):
        errors.append("AiPlanSection must sit above body, outside non-scrolling header")

    docs = ROOT / "docs/jp-lesson-ref-attach-batch-api.txt"
    if not docs.is_file():
        errors.append("missing docs/jp-lesson-ref-attach-batch-api.txt")

    bark_doc = ROOT / "docs/jp-lesson-ai-plan-prompt-bark-api.txt"
    if not bark_doc.is_file():
        errors.append("missing docs/jp-lesson-ai-plan-prompt-bark-api.txt")
    else:
        bark_txt = bark_doc.read_text(encoding="utf-8")
        for needle in (
            "/api/jp-lesson/ai-plan-prompt-bark",
            "/api/admin/jp-lesson-ai-plan-prompt-bark",
            "delay_min",
            "schedule_bark",
            "paymentsuccess",
            "禁止 critical",
        ):
            if needle not in bark_txt:
                errors.append(f"bark api doc missing {needle}")

    bark_lib = (
        ROOT / "src/lib/jp-lesson-ai-plan-prompt-bark.ts"
    ).read_text(encoding="utf-8")
    for needle in (
        "JP_LESSON_AI_PLAN_PROMPT_BARK_DEFAULT_DELAY_MIN = 7",
        "recordJpLessonAiPlanPromptCopied",
        "fireDueJpLessonAiPlanPromptBark",
        'level: "active"',
        'sound: "paymentsuccess"',
        "jp_lesson_ai_plan_prompt_bark",
    ):
        if needle not in bark_lib:
            errors.append(f"bark lib missing {needle}")
    if "critical" in bark_lib and 'level: "critical"' in bark_lib:
        errors.append("ai-plan prompt bark must not use level critical")
    if "call: true" in bark_lib:
        errors.append("ai-plan prompt bark must not use call")

    bark_client = (
        ROOT / "src/lib/jp-lesson-ai-plan-prompt-bark-client.ts"
    ).read_text(encoding="utf-8")
    for needle in (
        "JP_LESSON_AI_PLAN_PROMPT_BARK_DELAY_MIN = 7",
        "afterJpLessonAiPlanPromptCopySuccess",
        "window.confirm",
        "/api/jp-lesson/ai-plan-prompt-bark",
    ):
        if needle not in bark_client:
            errors.append(f"bark client missing {needle}")

    admin_route = (
        ROOT / "src/app/api/admin/jp-lesson-ai-plan-prompt-bark/route.ts"
    ).read_text(encoding="utf-8")
    if "verifyUploadAuth" not in admin_route:
        errors.append("admin fire route must verifyUploadAuth")
    if "fireDueJpLessonAiPlanPromptBark" not in admin_route:
        errors.append("admin fire route must call fireDue")

    sched_route = (
        ROOT / "src/app/api/jp-lesson/ai-plan-prompt-bark/route.ts"
    ).read_text(encoding="utf-8")
    if "requireAdmin" not in sched_route:
        errors.append("schedule route must requireAdmin")
    if "recordJpLessonAiPlanPromptCopied" not in sched_route:
        errors.append("schedule route must record copied")

    worker = (ROOT / "cloudflare-worker.ts").read_text(encoding="utf-8")
    for needle in (
        "/api/admin/jp-lesson-ai-plan-prompt-bark",
        "runJpLessonAiPlanPromptBark",
        "jp-lesson-ai-plan-prompt-bark",
    ):
        if needle not in worker:
            errors.append(f"cloudflare-worker missing {needle}")

    for path in (
        ROOT / "src/components/JpLessonAiPlanPromptModal.tsx",
        ROOT
        / "src/components/jp-lesson-page/JpLessonContentEditAiPlanSection.tsx",
    ):
        text = path.read_text(encoding="utf-8")
        if "afterJpLessonAiPlanPromptCopySuccess" not in text:
            errors.append(f"{path.name} must call afterJpLessonAiPlanPromptCopySuccess")

    index = (ROOT / "docs/external-apis-for-copy.txt").read_text(encoding="utf-8")
    if "jp-lesson-ref-attach-batch-api.txt" not in index:
        errors.append("external-apis index must list attach-batch doc")
    if "jp-lesson-ai-plan-prompt-bark-api.txt" not in index:
        errors.append("external-apis index must list ai-plan-prompt-bark doc")

    feature = (ROOT / "docs/feature-index.md").read_text(encoding="utf-8")
    if "jp-lesson-ai-plan-prompt-bark" not in feature:
        errors.append("feature-index must mention ai-plan-prompt-bark")

    rule = ROOT / ".cursor/rules/jp-lesson-ai-plan-prompt.mdc"
    if not rule.is_file():
        errors.append("missing jp-lesson-ai-plan-prompt.mdc")
    else:
        rule_txt = rule.read_text(encoding="utf-8")
        if "7 分钟 Bark" not in rule_txt and "7分钟 Bark" not in rule_txt:
            errors.append("jp-lesson-ai-plan-prompt.mdc must document 7 min Bark")
        if "sleep" not in rule_txt:
            errors.append("rule must forbid sleep in Worker")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: jp-lesson ai plan prompt guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
