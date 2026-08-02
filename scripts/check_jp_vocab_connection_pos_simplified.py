#!/usr/bin/env python3
"""Regression: 接序词类列须简体中文、禁止假名读音括注。

对照 src/lib/jp-vocab-connection-ai.ts → rewriteJpVocabConnectionPosToSimplifiedChinese
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONN = ROOT / "src/lib/jp-vocab-connection-ai.ts"
FILL = ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def rewrite_pos_simplified(raw: str) -> str:
    """Mirror rewriteJpVocabConnectionPosToSimplifiedChinese."""
    t = str(raw or "")
    t = re.sub(
        r"([\u4E00-\u9FFF々]+)(?:\([\u3040-\u309Fー]+\)|（[\u3040-\u309Fー]+）)",
        r"\1",
        t,
    )
    t = re.sub(r"\([\u3040-\u309Fー]+\)", "", t)
    t = re.sub(r"（[\u3040-\u309Fー]+）", "", t)
    for a, b in (
        ("助動詞", "助动词"),
        ("動詞", "动词"),
        ("い形容詞", "一类形容词"),
        ("な形容詞", "二类形容词"),
        ("形容詞", "形容词"),
        ("名詞", "名词"),
        ("副詞", "副词"),
        ("助詞", "助词"),
        ("一類", "一类"),
        ("二類", "二类"),
        ("三類", "三类"),
        ("語幹", "词干"),
        ("辞書形", "辞书形"),
        ("連体形", "连体形"),
        ("連用形", "连用形"),
        ("終止形", "终止形"),
        ("仮定形", "假定形"),
    ):
        t = t.replace(a, b)
    return t


def main() -> None:
    src = CONN.read_text(encoding="utf-8")
    for needle in (
        "rewriteJpVocabConnectionPosToSimplifiedChinese",
        "禁止日语繁体词类字",
        "禁止词类旁假名读音括注",
        "动词普通形＋ようだ；一类形容词普通形＋ようだ",
    ):
        if needle not in src:
            fail(f"connection-ai missing {needle!r}")

    if "rewriteJpVocabConnectionPosToSimplifiedChinese(" not in src:
        fail("normalize 须调用 rewriteJpVocabConnectionPosToSimplifiedChinese")

    dirty = (
        "動詞(どうし)普通形(ふつうけい)＋ようだ；"
        "一類形容詞(いちるいけいようし)普通形(ふつうけい)＋ようだ；"
        "二類形容詞(にるいけいようし)語幹(ごかん)＋なようだ；"
        "名詞(めいし)＋のようだ"
    )
    got = rewrite_pos_simplified(dirty)
    expect = (
        "动词普通形＋ようだ；"
        "一类形容词普通形＋ようだ；"
        "二类形容词词干＋なようだ；"
        "名词＋のようだ"
    )
    if got != expect:
        fail(f"ようだ rewrite failed:\n  got={got!r}\n  expect={expect!r}")

    if "どうし" in got or "ふつうけい" in got or "動詞" in got or "一類" in got:
        fail(f"still has JP reading / traditional POS: {got!r}")

    # 辞书形：繁体入口也要变简体注解
    jisho = rewrite_pos_simplified("動詞辞書形＋ことがある")
    if "動詞" in jisho or "辞書" in jisho:
        fail(f"辞书形 must simplify: {jisho!r}")
    if "动词辞书形" not in jisho:
        fail(f"expected 动词辞书形 in {jisho!r}")

    fill = FILL.read_text(encoding="utf-8")
    if "禁止词类旁假名读音括注" not in fill and "禁止「動詞(どうし)」" not in fill:
        fail("Mac fill prompt 须禁止词类假名读音 / 繁体词类")

    print("OK: connection POS labels → simplified Chinese, no furigana")
    return 0


if __name__ == "__main__":
    raise SystemExit(main() or 0)
