"""日语例句假名漏标检测（与线上 incomplete_kanji_furigana 对齐）。

剥掉合法「漢字(かな)」后，剩余汉字即漏标。
供 online-batch：检出后回传 Claude 整份重写例句，而不是直接失败。
"""

from __future__ import annotations

import re
from typing import Any

# 与 src/lib/jp-vocab-example-sentences.ts VALID_KANJI_FURIGANA_CHUNK 对齐
VALID_KANJI_FURIGANA_CHUNK = re.compile(
    r"[\u4E00-\u9FFF々]+[ぁ-んァ-ンヴヵヶー]*[（(][ぁ-んァ-ンヴヵヶー]+[）)]"
)
KANJI_RE = re.compile(r"[\u4E00-\u9FFF々]")
JLPT_TAIL_RE = re.compile(r"[（(]\s*N\s*[1-5]\s*[）)]\s*$", re.I)
GLOSS_LINE_RE = re.compile(r"^(译文|翻譯|翻译|译|譯|訳文|訳)\s*[:：]")


def list_unannotated_kanji(japanese_line: str) -> list[str]:
    """返回该日语行里仍无假名括注的汉字（去重、保序）。"""
    text = JLPT_TAIL_RE.sub("", str(japanese_line or "").strip())
    without = VALID_KANJI_FURIGANA_CHUNK.sub("", text)
    seen: set[str] = set()
    out: list[str] = []
    for ch in KANJI_RE.findall(without):
        if ch not in seen:
            seen.add(ch)
            out.append(ch)
    return out


def iter_japanese_example_lines(block: str) -> list[tuple[int, str]]:
    """(1-based 日语句序号, 日语行原文)。跳过译文行。"""
    rows: list[tuple[int, str]] = []
    idx = 0
    for raw in str(block or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        if GLOSS_LINE_RE.match(line):
            continue
        idx += 1
        rows.append((idx, line))
    return rows


def describe_incomplete_furigana(example_sentences: str) -> str | None:
    """人读反馈；无漏标返回 None。

    例：第1句缺少假名读音：私；第2句缺少假名读音：今日、音楽
    """
    parts: list[str] = []
    all_kanji: list[str] = []
    for n, line in iter_japanese_example_lines(example_sentences):
        missing = list_unannotated_kanji(line)
        if not missing:
            continue
        for ch in missing:
            if ch not in all_kanji:
                all_kanji.append(ch)
        parts.append(f"第{n}句缺少假名读音：{'、'.join(missing)}")
    if not parts:
        return None
    head = f"漏标汉字合计：{'、'.join(all_kanji)}。"
    return head + " " + "；".join(parts) + "。"


def build_furigana_retry_hint(example_sentences: str, *, kind: str = "word") -> str | None:
    """拼进 Anthropic user prompt 的 CRITICAL 重写指示。"""
    detail = describe_incomplete_furigana(example_sentences)
    if not detail:
        return None
    if kind == "grammar":
        fields = "usage、example_sentences、connection（变形课只要 example_sentences）"
    else:
        fields = "reading、meaning、pos、example_sentences"
    return (
        "\n\nCRITICAL: 上次 example_sentences 假名不全，写回会被拒 incomplete_kanji_furigana。\n"
        f"{detail}\n"
        f"请重新输出完整 JSON（含 {fields}）。\n"
        "example_sentences 必须整份重写（不要只改漏的字拼进旧句）；"
        "句中每一个汉字都必须立刻半角括号假名，"
        "例如 ❌私の趣味(しゅみ)は… → ✅私(わたし)の趣味(しゅみ)は…。\n"
        "读音/释义/词性若上次已正确可原样再输出一遍，与新例句一起交回。"
    )


def merge_fill_payload(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    """新稿非空字段覆盖旧稿；例句以新稿整段为准（只要新稿有例句）。"""
    out = dict(old or {})
    for key, value in (new or {}).items():
        text = str(value or "").strip()
        if not text:
            continue
        out[key] = value
    return out
