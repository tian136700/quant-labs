#!/usr/bin/env python3
"""回归：日语语法用法+例句配对与付费脚本门禁。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    helpers = (ROOT / "src/lib/jp-vocab-db/helpers.ts").read_text(encoding="utf-8")
    fill_usage = (ROOT / "src/lib/jp-vocab-fill-usage.ts").read_text(encoding="utf-8")
    usage_ai = (ROOT / "src/lib/jp-vocab-usage-ai.ts").read_text(encoding="utf-8")
    fill_ex = (
        ROOT / "src/lib/jp-vocab-fill-example-sentences.ts"
    ).read_text(encoding="utf-8")
    display = (
        ROOT / "src/lib/jp-vocab-usage-examples-display.ts"
    ).read_text(encoding="utf-8")
    paired = (
        ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"
    ).read_text(encoding="utf-8")
    flash = (
        ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    ).read_text(encoding="utf-8")
    script = (
        ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py"
    ).read_text(encoding="utf-8")
    route = (
        ROOT / "src/app/api/jp-vocab/fill-usage/route.ts"
    ).read_text(encoding="utf-8")

    if 'ADD COLUMN usage TEXT' not in helpers and '"usage"' not in helpers:
        errors.append("helpers.ts 未确保 usage 列")
    if "usage_source" not in helpers or "WORD_SELECT" not in helpers:
        errors.append("helpers.ts WORD_SELECT/mapRow 缺 usage_source")
    if "kind = 'grammar'" not in fill_usage:
        errors.append("fill-usage 须只补 grammar")
    if "clear_grammar_examples" not in route and "clearAllJpVocabGrammarExampleSentences" not in fill_usage:
        errors.append("缺 clear_grammar_examples")
    if "TRIM(usage)" in fill_usage.split("WHERE")[0] if False else False:
        pass
    if "usage IS NULL OR usage = ''" not in fill_usage:
        errors.append("fill-usage list_missing 应用 usage IS NULL OR usage=''（勿全表 TRIM 热扫）")
    if "countJpVocabUsagePoints" not in usage_ai:
        errors.append("usage-ai 缺 countJpVocabUsagePoints")
    if "kind = 'grammar' AND usage IS NOT NULL" not in fill_ex:
        errors.append("例句 list_missing 语法须要求已有 usage")
    if "buildJpVocabUsageExamplePairs" not in display:
        errors.append("缺配对 helper")
    if "JpVocabFuriganaText" not in paired:
        errors.append("配对组件须用 JpVocabFuriganaText")
    if "JpVocabUsageExamplesPairedContent" not in flash:
        errors.append("抽问卡未接语法配对组件")
    if "FILL_PER_ROUND" not in script or "acquire_paid_rate_gate" not in script:
        errors.append("付费脚本缺限流门禁")
    if "clear_grammar_examples" not in script:
        errors.append("脚本缺 --clear-examples / clear_grammar_examples")
    if "kind\": \"grammar\"" not in script and '"kind": "grammar"' not in script:
        errors.append("脚本例句 list_missing 须 kind=grammar")
    if 'get("total_missing") or -1' in script:
        errors.append(
            "脚本 loop 用 total_missing or -1（0 会变成 -1 空转狂打 list_missing）"
        )
    if "left_raw is not None" not in script:
        errors.append("脚本须显式判断 total_missing is not None（防 0 falsy）")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("ok: jp-vocab grammar usage/examples guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
