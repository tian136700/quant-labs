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
    if "ADD COLUMN connection TEXT" not in helpers:
        errors.append("helpers.ts 未确保 connection 列")
    if "connection_source" not in helpers or "connection," not in helpers:
        errors.append("helpers.ts WORD_SELECT/mapRow 缺 connection")
    conn_ai = (ROOT / "src/lib/jp-vocab-connection-ai.ts").read_text(encoding="utf-8")
    if "【接序】" not in conn_ai:
        errors.append("connection-ai 须用【接序】标记段")
    if "JpVocabConnectionSection" not in flash:
        errors.append("抽问卡须展示 JpVocabConnectionSection")
    if "showWhenEmpty" not in flash:
        errors.append("抽问卡接序须 showWhenEmpty（无数据也显示「接序」块）")
    review = (
        ROOT / "src/components/JpVocabAdminReviewFlashcardModal.tsx"
    ).read_text(encoding="utf-8")
    if "JpVocabConnectionSection" not in review or "showWhenEmpty" not in review:
        errors.append("复习卡接序须 JpVocabConnectionSection + showWhenEmpty")
    if "showExamples || hasJpVocabConnection" not in flash and "showExamples || hasJpVocabConnection" not in review:
        # teacher card uses showExamples || has…
        if "showExamples || hasJpVocabConnection(w.connection)" not in flash:
            errors.append("抽问卡无接序数据时仍应随用法/例句区显示接序块")
    if "need_connection" not in fill_usage:
        errors.append("fill-usage list_missing 须含 need_connection")
    if "listJpVocabGrammarMissingConnection" not in fill_usage:
        errors.append("fill-usage 须含 listJpVocabGrammarMissingConnection")
    if "list_missing_connection" not in route:
        errors.append("fill-usage route 须支持 list_missing_connection")
    conn_script = (
        ROOT / "scripts/jp-vocab-fill-grammar-connection-api.py"
    ).read_text(encoding="utf-8")
    if "list_missing_connection" not in conn_script:
        errors.append("接序定时脚本须调 list_missing_connection")
    if "connection" not in script or "split_connection_section" not in script:
        errors.append("Mac 脚本须解析【接序】并写回 connection")
    if "禁止另开定时任务只补接序" not in rule and "另开定时任务只补接序" not in rule:
        errors.append("规则须禁止另开定时只补接序")
    if "kind = 'grammar'" not in fill_usage:
        errors.append("fill-usage 须只补 grammar")
    if "clear_grammar_examples" not in route and "clearAllJpVocabGrammarExampleSentences" not in fill_usage:
        errors.append("缺 clear_grammar_examples")
    if "宽查全部语法" not in fill_usage and "example_sentences IS NULL OR example_sentences = ''" not in fill_usage:
        errors.append("list_missing 须宽查语法或缺例句（成对补）")
    if "exN < 3" not in fill_usage:
        errors.append("list_missing 须把单用法例句不足 3 条算缺失")
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
    if "usage_has_connection" not in usage_ai:
        errors.append("须拒 usage_has_connection（用法夹接续）")
    if "usage_empty_after_strip" not in usage_ai:
        errors.append("须拒 usage_empty_after_strip（剥接续后空用法）")
    if "stripJpVocabUsageConnectionNoise" not in usage_ai:
        errors.append("须有 stripJpVocabUsageConnectionNoise")
    if "(N5)" not in usage_ai:
        errors.append("usage prompt 须要求句末 (N5) 等级")
    if "isJpVocabConjugationGrammar" not in usage_ai:
        errors.append("须识别变形/变化规则词条")
    if "isJpVocabContrastGrammar" not in usage_ai:
        errors.append("须识别读音/形态对比词条")
    if "contrast_missing_distinction" not in usage_ai:
        errors.append("须拒 contrast_missing_distinction")
    if "CONTRAST_PAIR_SYSTEM" not in script:
        errors.append("Mac 脚本须有 CONTRAST_PAIR_SYSTEM")
    if "is_contrast_word" not in script:
        errors.append("Mac 脚本须识别 is_contrast_word")
    if "isJpVocabGrammarUsageExamplesPairComplete" not in usage_ai:
        errors.append("usage-ai 须判断变形课完成条件")
    if "isJpVocabGrammarUsageExamplesPairComplete" not in fill_usage:
        errors.append("fill-usage list_missing 须过滤已完成的变形课")
    if "is_grammar_pair_still_missing" not in script:
        errors.append("Mac 脚本须客户端跳过已完成的变形课（防卡队）")
    if "活用课" not in rule or (
        "有例句+接续表即算完成" not in rule
        and "有例句即算完成" not in rule
        and "接续表" not in rule
    ):
        errors.append("规则须写明变形课例句+接续表完成条件、勿卡 list_missing")
    if "不要接序" in usage_ai or "变形课不要接序" in usage_ai:
        errors.append("usage-ai 禁止再写「变形课不要接序」（须 id=521 式接续表）")
    if "id=521" not in usage_ai and "变形结果" not in usage_ai:
        errors.append("usage-ai 变形课须要求接续表（标本 id=521）")
    if "禁止任何「用法」" not in usage_ai and "禁止任何用法" not in usage_ai and "编号用法长文" not in usage_ai:
        errors.append("变形词条 prompt 须禁止编号用法长文")
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
    if "单用法" not in usage_ai or "3 条" not in usage_ai:
        errors.append("usage prompt 须写明单用法 → 恰好 3 条例句")
    if "多用法" not in usage_ai and "1:1" not in usage_ai:
        errors.append("usage prompt 须写明多用法 → 1:1")
    if "course_label" not in usage_ai and "教材课次" not in usage_ai:
        errors.append("usage prompt 须支持教材课次 / course_label（防超纲）")
    if "张冠李戴" not in usage_ai and "对应该条用法" not in usage_ai:
        errors.append("usage prompt 须要求例句接续对应该条用法（防た形/辞书形错挂）")
    if "pair_semantic_mismatch" not in usage_ai:
        errors.append("usage upload_spec 须拒 pair_semantic_mismatch（防语义错挂）")
    if "语义必须对齐" not in usage_ai and "点名的形态" not in usage_ai:
        errors.append("usage prompt 须要求用法↔例句语义对齐")
    align_ts = (
        ROOT / "src/lib/jp-vocab-usage-example-pair-align.ts"
    ).read_text(encoding="utf-8")
    if "validateJpVocabUsageExamplePairAlignment" not in align_ts:
        errors.append("缺 usage-example pair alignment 模块")
    if "single_usage_need_three" not in align_ts:
        errors.append("pair align 须拒 single_usage_need_three")
    ex_ai = (
        ROOT / "src/lib/jp-vocab-example-sentences-ai.ts"
    ).read_text(encoding="utf-8")
    if "validateJpVocabUsageExamplePairAlignment" not in ex_ai:
        errors.append("example apply 须调用 pair alignment")
    if "单用法" not in script or "3 条" not in script:
        errors.append("Mac PAIR_SYSTEM 须含单用法 → 3 条例句")
    if "1:1" not in script and "对应该条用法" not in script:
        errors.append("Mac PAIR_SYSTEM 须含多用法 1:1 / 接续对应")
    if "语义必须对齐" not in script and "点名的形态" not in script:
        errors.append("Mac PAIR_SYSTEM 须要求语义对齐")
    if "单用法" not in rule or "3 条" not in rule:
        errors.append("grammar-usage 规则须写明单用法 → 3 条例句")
    if "1:1" not in rule and "恰好 1 条" not in rule:
        errors.append("grammar-usage 规则须写明多用法 1:1 / 接续对应")
    if "course_label" not in fill_usage:
        errors.append("fill-usage list_missing 须带 course_label 给 prompt")
    if "pair_semantic_mismatch" not in rule and "语义" not in rule:
        errors.append("grammar-usage 规则须写 pair_semantic_mismatch / 语义对齐")
    if "按块均分" not in display and "examples.length % points.length" not in display:
        errors.append("展示层须支持多例句按块均分（存量兜底）")
    if "nestExamplesUnderSingleUsage" not in display and "nestedExamples" not in display:
        errors.append("展示层须支持单用法挂多条例句（nestedExamples）")
    freq_bars = (
        ROOT / "src/components/JpVocabUsageFrequencyBars.tsx"
    ).read_text(encoding="utf-8")
    if "口语频率" not in freq_bars or "考试频率" not in freq_bars:
        errors.append("用法旁频率条须用完整「口语频率」「考试频率」文案")
    if "score / 10" not in freq_bars and "/ 10" not in freq_bars:
        errors.append("频率条须按满分 10 算宽度（7→70%）")
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
