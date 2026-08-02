#!/usr/bin/env python3
"""回归：读音/形态对比课（何＝なに／なん）须走【区别】+2 组，禁止多条场景用法清单。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    contrast = (ROOT / "src/lib/jp-vocab-contrast-usage-ai.ts").read_text(
        encoding="utf-8"
    )
    usage_ai = (ROOT / "src/lib/jp-vocab-usage-ai.ts").read_text(encoding="utf-8")
    display = (
        ROOT / "src/lib/jp-vocab-usage-examples-display.ts"
    ).read_text(encoding="utf-8")
    script = (
        ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py"
    ).read_text(encoding="utf-8")
    rule = (ROOT / ".cursor/rules/jp-vocab-grammar-usage.mdc").read_text(
        encoding="utf-8"
    )
    quality = (
        ROOT / ".cursor/rules/jp-vocab-content-quality-guard.mdc"
    ).read_text(encoding="utf-8")

    for needle in (
        "isJpVocabContrastGrammar",
        "buildJpVocabContrastUsageAiPromptAppendix",
        "splitJpVocabUsageDistinctionLead",
        "【区别】",
        "禁止按场景拆成",
    ):
        if needle not in contrast:
            errors.append(f"contrast-usage-ai 缺 {needle!r}")

    for needle in (
        "isJpVocabContrastGrammar",
        "contrast_missing_distinction",
        "contrast_need_two_points",
        "isJpVocabContrastUsageComplete",
        "读音/形态对比",
    ):
        if needle not in usage_ai:
            errors.append(f"usage-ai 缺 {needle!r}")

    if "jpVocabContrastPairLabel" not in display:
        errors.append("display 须用对比侧标签 jpVocabContrastPairLabel")
    if "fallbackUsage: distinctionLead" not in display and "distinctionLead" not in display:
        errors.append("display 须展示【区别】lead")

    for needle in (
        "CONTRAST_PAIR_SYSTEM",
        "is_contrast_word",
        "禁止拆成 5～7 条",
        "【区别】",
    ):
        if needle not in script:
            errors.append(f"Mac grammar fill 缺 {needle!r}")

    if "对比" not in rule and "【区别】" not in rule:
        errors.append("grammar-usage 规则须写明对比课格式")
    if "contrast_missing_distinction" not in quality and "なに／なん" not in quality:
        errors.append("content-quality 规则须记录对比课坑")

    teacher = (
        ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    ).read_text(encoding="utf-8")
    if "区别 / 例句" not in teacher:
        errors.append("抽问卡对比课标题须为「区别 / 例句」")

    table = (
        ROOT / "src/components/JpVocabContrastDistinctionTable.tsx"
    ).read_text(encoding="utf-8")
    if "读法" not in table or "何时用" not in table or "接续" not in table:
        errors.append("对比区别表须含列：读法 / 何时用 / 接续")
    if "overflow-y: clip" not in table:
        errors.append("对比表须 overflow-y: clip（防触控板竖滑被拦）")

    paired = (
        ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"
    ).read_text(encoding="utf-8")
    if "JpVocabContrastDistinctionTable" not in paired:
        errors.append("配对组件须渲染 JpVocabContrastDistinctionTable")
    if "buildJpVocabContrastComparisonRows" not in display:
        errors.append("display 须有 buildJpVocabContrastComparisonRows")

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("ok: jp-vocab contrast usage format guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
