#!/usr/bin/env python3
"""回归：日语语法用法+例句成对同次调用与付费脚本门禁。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    helpers = (ROOT / "src/lib/jp-vocab-db/helpers.ts").read_text(encoding="utf-8")
    fill_usage = (ROOT / "src/lib/jp-vocab-fill-usage.ts").read_text(encoding="utf-8")
    usage_ai = (ROOT / "src/lib/jp-vocab-usage-ai.ts").read_text(encoding="utf-8")
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
    rule = (
        ROOT / ".cursor/rules/jp-vocab-grammar-usage.mdc"
    ).read_text(encoding="utf-8")

    if 'ADD COLUMN usage TEXT' not in helpers and '"usage"' not in helpers:
        errors.append("helpers.ts 未确保 usage 列")
    if "usage_source" not in helpers or "WORD_SELECT" not in helpers:
        errors.append("helpers.ts WORD_SELECT/mapRow 缺 usage_source")
    if "kind = 'grammar'" not in fill_usage:
        errors.append("fill-usage 须只补 grammar")
    if "clear_grammar_examples" not in route and "clearAllJpVocabGrammarExampleSentences" not in fill_usage:
        errors.append("缺 clear_grammar_examples")
    if "example_sentences IS NULL OR example_sentences = ''" not in fill_usage:
        errors.append("list_missing 须含缺例句（成对补）")
    if "example_sentences" not in route:
        errors.append("fill-usage apply 须接受 example_sentences")
    if "parseJpVocabGrammarUsageExamplePairs" not in usage_ai:
        errors.append("usage-ai 缺成对解析")
    if "jpVocabUsageLineLooksNonChinese" not in usage_ai:
        errors.append("usage-ai 缺中文用法校验")
    if "usage_not_chinese" not in usage_ai:
        errors.append("须拒 usage_not_chinese")
    if "usage_missing_level" not in usage_ai:
        errors.append("须拒 usage_missing_level")
    if "(N5)" not in usage_ai:
        errors.append("usage prompt 须要求句末 (N5) 等级")
    if "isJpVocabConjugationGrammar" not in usage_ai:
        errors.append("须识别变形/变化规则词条")
    if "isJpVocabGrammarUsageExamplesPairComplete" not in usage_ai:
        errors.append("usage-ai 须判断变形课有例句即完成")
    if "isJpVocabGrammarUsageExamplesPairComplete" not in fill_usage:
        errors.append("fill-usage list_missing 须过滤已完成的变形课")
    if "is_grammar_pair_still_missing" not in script:
        errors.append("Mac 脚本须客户端跳过已完成的变形课（防卡队）")
    if "活用课" not in rule or "有例句即算完成" not in rule:
        errors.append("规则须写明变形课有例句即完成、勿卡 list_missing")
    if "禁止任何「用法」" not in usage_ai and "禁止任何用法" not in usage_ai:
        errors.append("变形词条 prompt 须禁止用法、只给例句")
    if "parseJpVocabConjugationExamplesOnly" not in usage_ai:
        errors.append("须能解析变形课纯例句")
    if "变ます" not in usage_ai and "ます形规则" not in usage_ai:
        errors.append("变形识别须含变ます形/ます形规则")
    if "不要 JLPT 标签" in usage_ai:
        errors.append("usage prompt 不得再禁止句末等级括号")
    if "至少 2 组" in usage_ai or "至少写 2 条" in usage_ai:
        errors.append("usage prompt 禁止再强制至少 2 组")
    if "中文" not in usage_ai:
        errors.append("usage prompt 须强调中文用法")
    if "不要造例句" in usage_ai or "例句另有" in usage_ai:
        errors.append("usage prompt 禁止再写「例句另有阶段」")
    if "一次写完" not in usage_ai and "同一次输出" not in usage_ai:
        errors.append("usage prompt 须要求用法+例句同一次输出")
    if "clearJpVocabGrammarPairById" not in fill_usage:
        errors.append("fill-usage 缺单条 clear_pair")
    if "clear_pair" not in route:
        errors.append("route 缺 clear_pair")
    if "Math.max(2, n || 2)" in (
        ROOT / "src/lib/jp-vocab-example-sentences-ai.ts"
    ).read_text(encoding="utf-8"):
        errors.append("语法例句条数禁止再 Math.max(2,…) 硬凑")
    if "buildJpVocabUsageExamplePairs" not in display:
        errors.append("缺配对 helper")
    if "JpVocabFuriganaText" not in paired:
        errors.append("配对组件须用 JpVocabFuriganaText")
    if "JpVocabUsageExamplesPairedContent" not in flash:
        errors.append("抽问卡未接语法配对组件")
    if "FILL_PER_ROUND" not in script or "acquire_paid_rate_gate" not in script:
        errors.append("付费脚本缺限流门禁")
    if "parse_pair_output" not in script or "run_one_pair" not in script:
        errors.append("脚本须成对 run_one_pair（禁止拆两次付费）")
    if "run_one_usage" in script or "run_one_examples" in script:
        errors.append("脚本不得再保留分阶段 run_one_usage/examples")
    if 'get("total_missing") or -1' in script:
        errors.append(
            "脚本 loop 用 total_missing or -1（0 会变成 -1 空转狂打 list_missing）"
        )
    if "left_raw is not None" not in script:
        errors.append("脚本须显式判断 total_missing is not None（防 0 falsy）")
    if "LOOP_BUSY_SEC = 3 * 60" not in script:
        errors.append("--loop 有待补须 LOOP_BUSY_SEC=3 分钟（禁止秒级空转）")
    if "LOOP_IDLE_SEC = 10 * 60" not in script:
        errors.append("--loop 暂无/毒丸须 LOOP_IDLE_SEC=10 分钟")
    if "time.sleep(min_sec)" in script:
        errors.append("--loop 毒丸/空闲禁止再 sleep(min_sec) 秒级打 Worker")
    if "max-rounds" not in script and "max_rounds" not in script:
        errors.append("脚本须支持 max-rounds 冒烟")
    if "target_word_id" not in script:
        errors.append("脚本 --word-id 须定点 target_word_id（禁止误补 list 下一条）")
    if "wordId" not in fill_usage and "word_id" not in (
        ROOT / "src/app/api/jp-vocab/fill-usage/route.ts"
    ).read_text(encoding="utf-8"):
        errors.append("list_missing 须支持 word_id 定点")
    if "同一次" not in rule and "成对" not in rule:
        errors.append("规则须写明用法+例句同一次调用")
    if "(N5)" not in rule and "句末" not in rule:
        errors.append("规则须写明用法句末 (N5) 等级")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1
    print("ok: jp-vocab grammar usage/examples pair-once guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
