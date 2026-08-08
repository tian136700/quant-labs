#!/usr/bin/env python3
"""ない形接续表：一类通用う段规则 + 特殊例外；禁止按词尾拆满屏。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def collapse_like_ts(raw: str) -> str:
    """镜像 src/lib/jp-vocab-connection-nai-form.ts 的合并逻辑（抽查用）。"""
    text = (raw or "").strip()
    if not text:
        return text
    if re.search(r"一类动词[^;；]*(?:う段变あ段|词尾う段|う段改あ段|う段改为あ段)", text):
        return text
    if not (re.search(r"[＋+][^;；\n]*ない", text) or re.search(r"加「[^」]*ない」", text)):
        return text
    parts = [p.strip() for p in re.split(r"[；;]", text) if p.strip()]
    if len(parts) < 4:
        return text
    per_ending_re = re.compile(
        r"^一类动词去掉「[^」]+」加「[^」]*ない」＋[^｜;；]+(?:｜[^;；]*)?$"
    )
    special_re = re.compile(
        r"^一类动词(?:特殊)?[「『]?ある|^一类动词「ある」|^一类动词换成「ない」|^一类动词特殊"
    )
    per_ending: list[str] = []
    specials: list[str] = []
    rest: list[str] = []
    for part in parts:
        if special_re.search(part) or "存在动词特殊" in part:
            specials.append(part)
            continue
        if per_ending_re.match(part):
            per_ending.append(part)
            continue
        rest.append(part)
    if len(per_ending) < 3:
        return text
    general = (
        "一类动词词尾う段变あ段＋ない｜如「書く→書かない」「飲む→飲まない」"
        "（「う」尾变「わ」如「買う→買わない」）"
    )
    special_or = specials or ["一类动词「ある」换成「ない」＋ない｜存在动词特殊"]
    return "；".join([general, *special_or, *rest])


def main() -> int:
    nai = (ROOT / "src/lib/jp-vocab-connection-nai-form.ts").read_text(encoding="utf-8")
    if "collapseJpVocabNaiFormType1PerEndingRows" not in nai:
        fail("须有 collapseJpVocabNaiFormType1PerEndingRows")
    if "う段变あ段" not in nai:
        fail("样例须含一类通用う段变あ段")
    if "存在动词特殊" not in nai:
        fail("样例须含ある特殊行")

    conn_ai = (ROOT / "src/lib/jp-vocab-connection-ai.ts").read_text(encoding="utf-8")
    if "collapseJpVocabNaiFormType1PerEndingRows" not in conn_ai:
        fail("normalize 须调用 collapseJpVocabNaiFormType1PerEndingRows")

    usage = (ROOT / "src/lib/jp-vocab-usage-ai.ts").read_text(encoding="utf-8")
    if "JP_VOCAB_NAI_FORM_CONNECTION_EXAMPLE" not in usage:
        fail("usage-ai 变形 prompt 须引用ない形通用样例")

    bloated = (
        "一类动词去掉「う」加「わない」＋わない｜如「買う→買わない」；"
        "一类动词去掉「く」加「かない」＋かない｜如「書く→書かない」；"
        "一类动词去掉「む」加「まない」＋まない｜如「飲む→飲まない」；"
        "一类动词「ある」换成「ない」＋ない｜存在动词特殊；"
        "二类动词去掉「る」加「ない」＋ない｜如「食べる→食べない」；"
        "三类动词「する」换成「しない」＋しない｜如「勉強する→勉強しない」；"
        "三类动词「くる」换成「こない」＋こない｜如「来る→来ない」"
    )
    out = collapse_like_ts(bloated)
    if out.count("一类动词去掉") >= 3:
        fail(f"合并后仍有过多词尾行: {out!r}")
    if "う段变あ段" not in out:
        fail(f"合并后须有通用规则: {out!r}")
    if "存在动词特殊" not in out:
        fail(f"合并后须保留特殊ある: {out!r}")
    if "二类动词" not in out or "三类动词" not in out:
        fail(f"合并后须保留二／三类: {out!r}")

    # て形按音便分行不应被误合并
    te = (
        "一类动词去掉「く」加「いて」＋いて｜如「書く→書いて」；"
        "一类动词去掉「ぐ」加「いで」＋いで｜如「泳ぐ→泳いで」；"
        "一类动词去掉「す」加「して」＋して｜如「話す→話して」；"
        "二类动词去掉「る」加「て」＋て｜如「食べる→食べて」"
    )
    if collapse_like_ts(te) != te:
        fail("て形表不应被ない形合并逻辑改写")

    print("ok: jp-vocab nai-form connection collapse")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
