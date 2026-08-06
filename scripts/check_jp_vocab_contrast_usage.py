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
    if "parseJpVocabContrastForms" not in display:
        errors.append("display 须用 parseJpVocabContrastForms 填形态/标签")
    if '`${n}.对照`' in contrast or '`${n}.对照`' in display:
        errors.append("禁止回落标签「N.对照」——须用「くれる」等形态")
    if '|| "—"' in display or "|| '—'" in display:
        # 接续空列仍可用 —；形态函数禁止以 — 作缺省
        form_fn = display
        if 'jpVocabContrastFormFromPair' in form_fn:
            # 粗检：formFromPair 末尾不得 `|| "—"`
            idx = form_fn.find("export function jpVocabContrastFormFromPair")
            chunk = form_fn[idx : idx + 1800] if idx >= 0 else ""
            if 'return hint || "—"' in chunk or 'trim() || "—"' in chunk:
                errors.append("jpVocabContrastFormFromPair 禁止回落「—」")
    for needle in (
        "isJpVocabContrastFormToken",
        "jpVocabContrastFormHeadFromUsageText",
    ):
        if needle not in contrast:
            errors.append(f"contrast-usage-ai 缺 {needle!r}（防「我方」当形态）")
    if "isJpVocabContrastFormToken" not in display:
        errors.append("display 形态抽取须用 isJpVocabContrastFormToken")
    if "的例句" not in (
        ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"
    ).read_text(encoding="utf-8"):
        errors.append("对比例句标题须为「…的例句」（勿只写「对照 例句」）")
    if "fallbackUsage: distinctionLead" not in display and "distinctionLead" not in display:
        errors.append("display 须展示【区别】lead")

    for needle in (
        "CONTRAST_PAIR_SYSTEM",
        "is_contrast_word",
        "禁止拆成 5～7 条",
        "【区别】",
        "接序禁止",
        "主语是谁",
    ):
        if needle not in script:
            errors.append(f"Mac grammar fill 缺 {needle!r}")

    if "接序禁止夹用法" not in contrast and "主语是谁" not in contrast:
        errors.append("contrast prompt appendix 须禁止接序夹用法说明")
    if "くれる" not in contrast or "もらう" not in contrast:
        errors.append("contrast prompt 须含くれる／もらう接序样例")

    online = (ROOT / "scripts/jp-vocab-fill-online-batch-api.py").read_text(
        encoding="utf-8"
    )
    for needle in (
        "对比区别课",
        "connection_has_usage",
        "grammar_connection_has_usage_noise",
        "主语必须",
    ):
        if needle not in online:
            errors.append(f"online-batch GRAMMAR_SYSTEM/门禁缺 {needle!r}")

    if "对比" not in rule and "【区别】" not in rule:
        errors.append("grammar-usage 规则须写明对比课格式")
    if "contrast_missing_distinction" not in quality and "なに／なん" not in quality:
        errors.append("content-quality 规则须记录对比课坑")

    teacher = (
        ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"
    ).read_text(encoding="utf-8")
    if "区别 / 例句" not in teacher:
        errors.append("抽问卡对比课标题须为「区别 / 例句」")

    table_rule = ROOT / ".cursor/rules/jp-vocab-contrast-conjugation-table.mdc"
    if not table_rule.is_file():
        errors.append("缺 jp-vocab-contrast-conjugation-table.mdc（区别/变形→表格）")
    else:
        tr = table_rule.read_text(encoding="utf-8")
        for needle in ("表格", "区别", "变形", "JpVocabContrastDistinctionTable"):
            if needle not in tr:
                errors.append(f"contrast-conjugation-table 规则缺 {needle!r}")
        if "两列表格" not in tr and "何时用 / 接续" not in tr:
            errors.append("contrast-conjugation-table 须写明两列表格（何时用/接续）")
    if "展示分流" not in rule and "区别课 / 变形" not in rule:
        errors.append("grammar-usage 须写明区别/变形→表格 vs 句型→编号用法")
    if "接续表" not in rule and "id=521" not in rule:
        errors.append("grammar-usage 须写明变形课接续表（标本 id=521）")

    for needle in (
        "id=521",
        "词类／形态＋变形结果",
        "parseJpVocabConnectionTableRows",
        "connection_required",
    ):
        if needle not in usage_ai:
            # connection_required 可能只在 validate 分支
            if needle == "parseJpVocabConnectionTableRows":
                if "parseJpVocabConnectionTableRows(connection)" not in usage_ai:
                    errors.append(
                        "usage-ai 变形课完成判定须 parse 接续表（拒散文）"
                    )
            elif needle == "词类／形态＋变形结果":
                if "变形结果" not in usage_ai and "＋いて" not in usage_ai:
                    errors.append("usage-ai 变形课 prompt 须含接续表公式")
            elif needle not in usage_ai:
                errors.append(f"usage-ai 缺变形课门禁 {needle!r}")

    fill_usage = (ROOT / "src/lib/jp-vocab-fill-usage.ts").read_text(
        encoding="utf-8"
    )
    if "not_table" not in fill_usage:
        errors.append("fill-usage 须拒变形课散文接续（connection_invalid:not_table）")
    if "parseJpVocabConnectionTableRows(connection)" not in fill_usage:
        errors.append("fill-usage list_missing 变形课 need_connection 须按表判定")

    if "不要接序" in script or "不要接序段" in script:
        errors.append("Mac grammar fill 禁止再写「变形课不要接序」")
    if "CONJ_PAIR_SYSTEM" not in script or "id=521" not in script:
        errors.append("Mac CONJ_PAIR_SYSTEM 须要求 id=521 式接续表")
    if "去掉「く」加「いて」" not in usage_ai and "去掉…加…" not in usage_ai:
        errors.append("usage-ai て形接续表第一列须写清「去掉…加…」")
    if "一类形容词去掉「い」加「くて」" not in usage_ai:
        errors.append("usage-ai て形接续表须含一类形容词「去掉い加くて」")
    if "二类形容词去掉「だ」加「で」" not in usage_ai and "名词加「で」" not in usage_ai:
        errors.append("usage-ai て形接续表须含二类形容词／名词「で」")
    if "ない形课示例" not in usage_ai and "去掉「く」加「かない」" not in usage_ai:
        errors.append("usage-ai 须含ない形课接续表示例（防五段散文复发）")
    if "ない形示例" not in script and "去掉「く」加「かない」" not in script:
        errors.append("Mac CONJ_PAIR_SYSTEM 须含ない形表样例")

    table = (
        ROOT / "src/components/JpVocabContrastDistinctionTable.tsx"
    ).read_text(encoding="utf-8")
    if "何时用" not in table or "接续" not in table:
        errors.append("对比区别表须含列：何时用 / 接续")
    if "overflow-y: clip" not in table:
        errors.append("对比表须 overflow-y: clip（防触控板竖滑被拦）")
    if ">读法</th>" in table or 'scope="col">读法<' in table:
        errors.append("禁止恢复「读法」表头")

    paired = (
        ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"
    ).read_text(encoding="utf-8")
    if "JpVocabContrastDistinctionTable" not in paired:
        errors.append("配对组件须渲染 JpVocabContrastDistinctionTable")
    if "buildJpVocabContrastComparisonRows" not in display:
        errors.append("display 须有 buildJpVocabContrastComparisonRows")
    if '["读法", "何时用", "接续"]' in display:
        errors.append("复制全文不得再含「读法」列")
    if '["语法", "何时用"]' not in display:
        errors.append("复制全文区别表须为语法 / 何时用两列")
    if "【接序】" not in display or '["用法", "接续"]' not in display:
        errors.append("复制全文须单独输出接序表（用法 / 接续）")
    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("ok: jp-vocab contrast usage format guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
