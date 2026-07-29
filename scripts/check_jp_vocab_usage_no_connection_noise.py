#!/usr/bin/env python3
"""Regression: 用法正文不得夹带接序/接续；展示与校验须剥「接在…／构成＋」。

不调模型。对照 src/lib/jp-vocab-usage-ai.ts 的 strip / reject。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
USAGE_AI = ROOT / "src/lib/jp-vocab-usage-ai.ts"
DISPLAY = ROOT / "src/lib/jp-vocab-usage-examples-display.ts"
RULE = ROOT / ".cursor/rules/jp-vocab-grammar-usage.mdc"

JLPT_TAIL_RE = re.compile(r"^(.*?)[（(]\s*N\s*([1-5])\s*[）)]\s*$", re.I)


def strip_line(text: str) -> str:
    """Mirror stripJpVocabUsageConnectionNoiseFromLine (关键路径)."""
    t = text.strip()
    if not t:
        return ""
    m = JLPT_TAIL_RE.match(t)
    body = m.group(1).rstrip() if m else t
    level = f"(N{m.group(2)})" if m else ""

    parts = re.split(r"(?<=[。！？])", body)
    kept: list[str] = []
    for raw in parts:
        s = raw.strip()
        if not s:
            continue
        if re.match(r"^接在", s):
            continue
        if re.match(r"^构成「", s):
            continue
        if re.match(r"^接续", s):
            continue
        if re.match(r"^(?:前接|后接)", s):
            continue
        if (
            not re.match(r"^表示", s)
            and re.search(r"[＋+]", s)
            and re.search(r"(?:辞书形|て形|た形|ます形|普通形|词干)", s)
            and re.search(r"(?:动词|名词|形容词|一类|二类)", s)
        ):
            continue
        kept.append(s)
    body = "".join(kept)
    body = re.sub(r"[，、；;]?\s*接在[^。！？]*", "", body)
    body = re.sub(r"[，、；;]?\s*构成「[^」]*」(?:或「[^」]*」)*", "", body)
    body = body.strip(" ，、；;\t")
    if body and not re.search(r"[。！？]$", body):
        body += "。"
    if not body:
        return level
    return f"{body}{level}" if level else body


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    src = USAGE_AI.read_text(encoding="utf-8")
    for needle in (
        "stripJpVocabUsageConnectionNoise",
        "stripJpVocabUsageConnectionNoiseFromLine",
        "jpVocabUsageLineHasConnectionNoise",
        "usage_has_connection",
        "接在…之后",
    ):
        if needle not in src:
            fail(f"jp-vocab-usage-ai.ts missing {needle!r}")

    disp = DISPLAY.read_text(encoding="utf-8")
    if "stripJpVocabUsageConnectionNoise" not in disp:
        fail("usage-examples-display 展示前须剥接续噪音")

    dirty = (
        "表示在某动作或事件发生之前，先做另一件事。"
        "接在动词辞书形或名词「の」之后，"
        "构成「动词辞书形＋前に」或「名词＋の前に」。(N5)"
    )
    got = strip_line(dirty)
    if "接在" in got or "构成「" in got or "辞书形＋" in got:
        fail(f"～前に 样例应剥掉接续，得到: {got!r}")
    if "先做另一件事" not in got or "(N5)" not in got:
        fail(f"～前に 样例应保留义项与等级，得到: {got!r}")

    keep = "表示某处有东西：用「場所に＋名詞がある」结构。(N5)"
    kept = strip_line(keep)
    if "場所に＋名詞がある" not in kept:
        fail(f"义项里「」短引＋结构应保留: {kept!r}")

    rule = RULE.read_text(encoding="utf-8")
    if "usage_has_connection" not in rule:
        fail("jp-vocab-grammar-usage.mdc 须写明 usage_has_connection")

    print("OK: strip connection noise from usage")
    print(f"OK: dirty → {got}")
    print("All jp-vocab usage-no-connection-noise checks passed.")


if __name__ == "__main__":
    main()
