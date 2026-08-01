#!/usr/bin/env python3
"""Regression: 接续贴在用法下（用法N 换行拆分 + 内联展示，不单独「接序」块）。

对照 jp-vocab-connection-ai.ts / JpVocabUsageExamplesPairedContent。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONN = ROOT / "src/lib/jp-vocab-connection-ai.ts"
UI = ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"
BODY = ROOT / "src/components/JpVocabConnectionBody.tsx"
SECTION = ROOT / "src/components/JpVocabConnectionSection.tsx"
QUIZ = ROOT / "src/components/JpVocabTeacherQuizFlashcardModal.tsx"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def expand_breaks(raw: str) -> str:
    t = raw.replace("\r\n", "\n")
    t = re.sub(r"([^\n])\s*(?=用法\s*\d+\s*[：:])", r"\1\n", t)
    t = re.sub(r"([^\n])\s*(?=(?:否定形|肯定形|疑问形)\s*[：:「])", r"\1\n", t)
    t = re.sub(r"([。．])\s*(?=(?:否定形|肯定形|疑问形))", r"\1\n", t)
    return t


def split_semicolon_outside_parens(text: str) -> list[str]:
    parts: list[str] = []
    depth = 0
    buf = ""
    for ch in text:
        if ch in "（(":
            depth += 1
        elif ch in "）)":
            depth = max(0, depth - 1)
        if depth == 0 and ch in "；;":
            t = buf.strip()
            if t:
                parts.append(t)
            buf = ""
            continue
        buf += ch
    last = buf.strip()
    if last:
        parts.append(last)
    return parts


def parse_table_rows(raw: str) -> list[tuple[str, str]] | None:
    """Mirror parseJpVocabConnectionTableRows (colon lines or 词类＋接续；…)."""
    text = (raw or "").strip()
    if not text:
        return None
    # 1) colon multi-line
    colon_rows: list[tuple[str, str]] = []
    colon_ok = True
    for line in text.split("\n"):
        t = line.strip()
        if not t:
            continue
        m = re.match(r"^(.+?)[：:]\s*(.+)$", t)
        if not m:
            colon_ok = False
            break
        label, body = m.group(1).strip(), m.group(2).strip()
        if not label or not body or re.match(r"^用法\s*\d+\s*$", label) or len(label) > 36:
            colon_ok = False
            break
        colon_rows.append((label, body))
    if colon_ok and len(colon_rows) >= 2:
        return colon_rows

    # 2) semicolon ＋ segments
    flat = "；".join(ln.strip() for ln in text.split("\n") if ln.strip())
    if ("；" not in flat and ";" not in flat) or ("＋" not in flat and "+" not in flat):
        return None
    segs = split_semicolon_outside_parens(flat)
    if len(segs) < 2:
        return None
    rows: list[tuple[str, str]] = []
    for seg in segs:
        m = re.match(r"^(.+?)([＋+].+)$", seg)
        if not m:
            return None
        label, body = m.group(1).strip(), m.group(2).strip()
        if body.startswith("+"):
            body = "＋" + body[1:]
        if not label or not body or len(label) > 36 or "。" in label or "．" in label:
            return None
        if re.match(r"^用法\s*\d+\s*$", label):
            return None
        rows.append((label, body))
    return rows if len(rows) >= 2 else None


def main() -> None:
    src = CONN.read_text(encoding="utf-8")
    for needle in (
        "parseJpVocabConnectionDisplayParts",
        "expandJpVocabConnectionUsageInlineBreaks",
        "jpVocabConnectionShownInlineWithUsage",
        "parseJpVocabConnectionTableRows",
        "疑问形",
    ):
        if needle not in src:
            fail(f"connection-ai missing {needle!r}")

    body = BODY.read_text(encoding="utf-8")
    if "JpVocabConnectionBody" not in body:
        fail("missing JpVocabConnectionBody component")
    if "jp-vocab-conn-table" not in body:
        fail("ConnectionBody 须渲染接续表格")
    if "overflow-y: clip" not in body:
        fail("接续表 wrap 须 overflow-y: clip（触控板竖滑）")

    ui = UI.read_text(encoding="utf-8")
    if "JpVocabConnectionBody" not in ui:
        fail("PairedContent 须用 JpVocabConnectionBody")
    if "connectionTextFor" not in ui and "connText" not in ui:
        fail("PairedContent 须按用法挂接续")

    section = SECTION.read_text(encoding="utf-8")
    if "JpVocabConnectionBody" not in section:
        fail("ConnectionSection 须用 JpVocabConnectionBody")

    ba_sample = (
        "一类动词：词尾う段改え段＋ば（「書く」→「書けば」）\n"
        "二类动词：去る＋れば（「食べる」→「食べれば」）\n"
        "三类动词：「来る」→「来れば」；「する」→「すれば」\n"
        "一类形容词：去い＋ければ（「安い」→「安ければ」）\n"
        "二类形容词：词干＋であれば（「静か」→「静かであれば」）\n"
        "名词：名词＋であれば（「学生」→「学生であれば」）\n"
        "否定：ない→なければ（「行かない」→「行かなければ」）"
    )
    ba_rows = parse_table_rows(ba_sample)
    if ba_rows is None or len(ba_rows) < 4:
        fail(f"～ば 式接续应拆出 ≥4 表行，得到 {ba_rows!r}")
    if ba_rows[0][0] != "一类动词":
        fail(f"首行标签应为一类动词，得到 {ba_rows[0]!r}")

    single = parse_table_rows("动词て形＋もいい。")
    if single is not None:
        fail("单行无「标签：正文」结构不应走表格")

    to_sample = (
        "动词原形＋と；一类形容词词尾い＋と；二类形容词词干＋だと；"
        "名词＋だと（条件句前项不用た形）"
    )
    to_rows = parse_table_rows(to_sample)
    if to_rows is None or len(to_rows) < 4:
        fail(f"～と 分号接续应拆出 ≥4 表行，得到 {to_rows!r}")
    if to_rows[0] != ("动词原形", "＋と"):
        fail(f"～と 首行应为 动词原形 / ＋と，得到 {to_rows[0]!r}")
    if "条件句前项不用た形" not in to_rows[-1][1]:
        fail(f"～と 末行须保留括号说明，得到 {to_rows[-1]!r}")

    to_one = parse_table_rows("动词原形＋と（前后主语可不同；后项客观描述）")
    if to_one is not None:
        fail("仅 1 段「词类＋接续」不应走表格（括号内分号不拆）")

    for needle in (
        "splitJpVocabConnectionSemicolonOutsideParens",
        "tryParseSemicolonPlusConnectionTableRows",
    ):
        if needle not in src:
            fail(f"connection-ai missing semicolon table parse {needle!r}")

    for needle in (
        "academic_verb_class_terms",
        "rewriteJpVocabConnectionSchoolVerbClassTerms",
        "一类动词／二类动词／三类动词",
    ):
        if needle not in src:
            fail(f"connection-ai missing school verb-class guard {needle!r}")
    if "一类动词（五段）" in src:
        fail("接序示例禁止再写「一类动词（五段）」")
    if "禁止「五段" not in src and "❌禁止「五段" not in src and "❌ 禁止「五段" not in src:
        fail("接序 prompt 须禁止五段/一段/カ变术语")
    if "卡片会自动排表" not in src and "卡片自动排表" not in src and "卡片会把复杂接续自动排成表" not in src:
        fail("接序 prompt 须要求「；」或多行词类格式以便上表")
    if "禁止散文" not in src:
        fail("接序 prompt 须禁止散文罗列词类")


    quiz = QUIZ.read_text(encoding="utf-8")
    if "inlineConnection" not in quiz:
        fail("抽问卡内联接续时须隐藏单独接序块")
    if "connection={w.connection}" not in quiz:
        fail("抽问卡须把 connection 传给 PairedContent")

    raw = (
        "用法1: 動詞辞書形 + ことがある。"
        "用法2: 動詞た形 + ことがある。"
        "否定形: ことがない / ことはない。"
    )
    got = expand_breaks(raw)
    lines = [ln.strip() for ln in got.split("\n") if ln.strip()]
    if len(lines) < 3:
        fail(f"用法1/用法2/否定形 应拆成多行，得到 {lines!r}")
    if not lines[0].startswith("用法1"):
        fail(f"第一行应为用法1: {lines[0]!r}")
    if not any(ln.startswith("用法2") for ln in lines):
        fail("须含用法2行")

    packed = (
        "动词て形 + もいい。"
        "否定形「～なくてもいい」表示「不做也可以」。"
        "疑问形「～てもいいですか」用于礼貌地请求许可。"
    )
    packed_lines = [ln.strip() for ln in expand_breaks(packed).split("\n") if ln.strip()]
    if len(packed_lines) < 3:
        fail(f"てもいい 否定/疑问应换行，得到 {packed_lines!r}")
    if not any("否定形" in ln for ln in packed_lines):
        fail("须拆出否定形行")
    if not any("疑问形" in ln for ln in packed_lines):
        fail("须拆出疑问形行")

    # 裸「1. 2.」须能改写成「用法1:」「用法2:」，否则整段挂用法1、等级像丢了
    for needle in (
        "rewriteJpVocabConnectionBareNumberedToUsageTags",
        "bare_numbered_lines",
        "CONNECTION_BARE_NUMBERED_LINE_RE",
    ):
        if needle not in src:
            fail(f"connection-ai missing {needle!r}")

    bare = (
        "1. 动词原形＋と；一类形容词词尾い＋と\n"
        "2. 动词原形＋と（后项多用过去式）\n"
        "3. 动词原形＋と\n"
        "4. 动词普通形＋と"
    )
    # 与 TS rewrite 同规则的本地对照
    rewritten_lines = []
    for ln in bare.split("\n"):
        t = ln.strip()
        m = re.match(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$", t)
        if m:
            rewritten_lines.append(f"用法{m.group(1)}: {m.group(2).strip()}")
        else:
            rewritten_lines.append(t)
    if rewritten_lines[0] != "用法1: 动词原形＋と；一类形容词词尾い＋と":
        fail(f"裸编号应改成用法1: 得到 {rewritten_lines[0]!r}")
    if not all(ln.startswith("用法") for ln in rewritten_lines):
        fail(f"四行均须用法N: 得到 {rewritten_lines!r}")

    # ～ようと思う 式：括号嵌套词类散文 → 分行上表；写回拒 nested_class_colon_prose
    for needle in (
        "rewriteJpVocabConnectionNestedClassColonProse",
        "expandJpVocabConnectionNestedClassColonLine",
        "connectionHasNestedClassColonProse",
        "nested_class_colon_prose",
    ):
        if needle not in src:
            fail(f"connection-ai missing nested-class-colon guard {needle!r}")
    if "禁止括号嵌套散文" not in src and "括号嵌套" not in src:
        fail("接序 prompt 须禁止括号嵌套词类散文")

    you_prose = (
        "动词意志形（一类动词：く→こう／む→もう等；二类动词：る→よう；"
        "三类动词：する→しよう；三类动词：くる→こよう）＋と思う。"
    )
    # 与 TS expand 同规则的本地对照
    you_m = re.match(
        r"^(.+?)[（(](.+)[）)]\s*([＋+].+)$",
        you_prose.strip().rstrip("。．"),
    )
    if not you_m:
        fail("～ようと思う 散文样例应能拆出 prefix/inner/suffix")
    you_segs = split_semicolon_outside_parens(you_m.group(2))
    if len(you_segs) < 3:
        fail(f"～ようと思う 括号内应拆出 ≥3 词类段，得到 {you_segs!r}")
    you_table = (
        "一类动词：意志形（く→こう／む→もう等）＋と思う\n"
        "二类动词：意志形（る→よう）＋と思う\n"
        "三类动词：「する」→「しよう」；「くる」→「こよう」＋と思う\n"
        "注意：「～ようと思っている」表示持续意图，比「～ようと思います」更强调当前状态"
    )
    you_rows = parse_table_rows(you_table)
    if you_rows is None or len(you_rows) < 3:
        fail(f"～ようと思う 分行接续应拆出 ≥3 表行，得到 {you_rows!r}")
    if you_rows[0][0] != "一类动词" or "意志形" not in you_rows[0][1]:
        fail(f"～ようと思う 首行应为一类动词/意志形，得到 {you_rows[0]!r}")

    fill_usage = (ROOT / "src/lib/jp-vocab-fill-usage.ts").read_text(encoding="utf-8")
    if "requireJlptLevel: !isManual" in fill_usage:
        fail("语法用法等级不可再对「手动」放行；须 requireJlptLevel: true")
    if fill_usage.count("requireJlptLevel: true") < 2:
        fail("fill-usage 写回须两处 requireJlptLevel: true")

    notes = (ROOT / "src/lib/jp-vocab-db/notes_fields.ts").read_text(encoding="utf-8")
    if "validateJpVocabUsageAiOutput" not in notes:
        fail("编辑保存须校验用法句末 (Nn)")
    if "requireJlptLevel: true" not in notes:
        fail("编辑保存须强制用法等级")

    print("OK: connection inline under usage")
    print("All jp-vocab connection-inline-with-usage checks passed.")


if __name__ == "__main__":
    main()
