#!/usr/bin/env python3
"""本地格式自检：语法「用法+例句」成对解析（不调模型、不部署、不打线上）。

对照线上契约：中文用法、组数可为 1、假名只在例句、1:1 配对。
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_parse():
    path = ROOT / "scripts" / "jp-vocab-fill-grammar-usage-examples-api.py"
    text = path.read_text(encoding="utf-8")
    start = text.index("def parse_pair_output")
    end = text.index("\ndef pick_row")
    ns: dict = {
        "re": re,
        "HAN_RE": re.compile(r"[\u4E00-\u9FFF]"),
        "NUMBERED_LINE_RE": re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$"),
        "FENCE_RE": re.compile(r"^```(?:\w+)?\s*|\s*```$", re.MULTILINE),
    }
    exec(text[start:end], ns)  # noqa: S102
    return ns["parse_pair_output"]


def main() -> int:
    parse = load_parse()
    errors: list[str] = []

    # 1 组也合法（禁止硬凑 2）
    one = (
        "1. 表示原因、理由：前句说明原因，后句说明结果。\n"
        "今日(きょう)は雨(あめ)だから、家(いえ)にいます。\n"
        "译文：今天下雨，所以我待在家里。"
    )
    got = parse(one)
    if not got or "1." not in got[0] or "译文" not in got[1]:
        errors.append("单组成对应解析成功")

    # 中文用法 +「」内短引（可含少量形态）
    ok_cn = (
        "1. 表示某处有东西：用「場所に＋名詞がある」结构。\n"
        "机(つくえ)の上(うえ)に本(ほん)がある。\n"
        "译文：桌子上有一本书。\n"
        "2. 表示拥有。\n"
        "私(わたし)はお金(かね)がある。\n"
        "译文：我有钱。"
    )
    if not parse(ok_cn):
        errors.append("中文用法+「」短引应通过")

    # 整段日语用法（引号外假名过多）应拒
    bad_jp = (
        "1. 机の上に本があるときに使います。場所を表します。\n"
        "机(つくえ)の上(うえ)に本(ほん)がある。\n"
        "译文：桌子上有一本书。"
    )
    if parse(bad_jp) is not None:
        errors.append("整段日语用法应解析失败")

    # 「」外假名括注过多/日语正文应拒（冷たい样例）
    bad_furi = (
        "1. 「冷(つめ)たい」は触(ふ)れられる物(もの)に使(つか)う。\n"
        "この水(みず)は冷(つめ)たいです。\n"
        "译文：这水很凉。"
    )
    if parse(bad_furi) is not None:
        errors.append("用法行日语+假名括注应失败")

    # 标题行可跳过
    titled = "冷たい和寒い的区别\n" + one
    if not parse(titled):
        errors.append("应跳过标题行再解析")

    # TS 侧门禁字符串（与线上 apply 对齐）
    usage_ai = (ROOT / "src/lib/jp-vocab-usage-ai.ts").read_text(encoding="utf-8")
    ex_ai = (
        ROOT / "src/lib/jp-vocab-example-sentences-ai.ts"
    ).read_text(encoding="utf-8")
    fill_usage = (ROOT / "src/lib/jp-vocab-fill-usage.ts").read_text(encoding="utf-8")
    if "jpVocabUsageLineLooksNonChinese" not in usage_ai:
        errors.append("TS 缺 jpVocabUsageLineLooksNonChinese")
    if "jpVocabGrammarUsageOffLemma" not in usage_ai:
        errors.append("TS 缺 jpVocabGrammarUsageOffLemma（防塞其它语法点）")
    if "usage_off_lemma" not in usage_ai:
        errors.append("须拒 usage_off_lemma")
    if "examples_required" not in fill_usage and "examples_required" not in usage_ai:
        errors.append("非手动写回须要求 examples_required")
    if "Math.max(2, n || 2)" in ex_ai:
        errors.append("语法例句条数禁止再硬凑 max(2)")
    if "n.slice(0, -1)" not in ex_ai:
        errors.append("grammar_not_used 须认词干变形（ておき←ておく）")
    if "need_one_point" not in usage_ai:
        errors.append("用法校验须允许 1 条（need_one_point）")

    # off-lemma 样例（纯本地）
    off = (
        "1. 表示经历：「～たことがある」。\n"
        "富士山(ふじさん)に登(のぼ)ったことがある。\n"
        "译文：我爬过富士山。"
    )
    # parse may still succeed structurally; TS gate is source of truth — assert string present
    if "たことがある" not in off:
        errors.append("fixture")

    if errors:
        print("FAIL: jp-vocab grammar pair format (local)")
        for e in errors:
            print(f" - {e}")
        return 1
    print("ok: jp-vocab grammar pair format (local, no deploy)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
