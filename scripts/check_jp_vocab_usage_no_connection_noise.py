#!/usr/bin/env python3
"""Regression: 用法正文不得夹带接序/接续；展示与校验须剥「接在…／构成＋」。

不调模型。对照 src/lib/jp-vocab-usage-ai.ts 的 strip / reject。
禁止把「た形＋とき表示…」这类义项整句剥成只剩 (N3)。
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


def is_connection_formula(s: str) -> bool:
    t = s.strip()
    if not t:
        return False
    if re.match(r"^接在", t):
        return True
    if re.match(r"^构成「", t):
        return True
    if re.match(r"^接续", t):
        return True
    if re.match(r"^(?:前接|后接)", t):
        return True
    if re.match(r"^(?:可)?接(?:在)?(?:动词|名词|一类|二类|い|な|形容词)", t):
        return True
    if (
        re.match(r"^(?:动词|名词|一类|二类|い形容|な形容|形容词)", t)
        and re.search(r"[＋+]", t)
        and re.search(r"(?:辞书形|て形|た形|ます形|普通形|词干)", t)
    ):
        return True
    return False


def strip_line(text: str) -> str:
    """Mirror stripJpVocabUsageConnectionNoiseFromLine."""
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
        if is_connection_formula(s):
            continue
        kept.append(s)
    body = "".join(kept)
    body = re.sub(r"[，、；;]?\s*接在[^。！？]*", "", body)
    body = re.sub(r"[，、；;]?\s*构成「[^」]*」(?:或「[^」]*」)*", "", body)
    body = re.sub(r"[，、；;]?\s*接续(?:形态|方式|方法|规则)?[^。！？]*", "", body)
    body = re.sub(
        r"[，、；;]?\s*(?:前接|后接)(?:动词|形容词|名词|一类|二类)[^。！？]*",
        "",
        body,
    )
    body = re.sub(
        r"[，、；;]?\s*(?:可)?接(?:在)?(?:动词|名词|一类|二类|い|な|形容词)[^。！？]*",
        "",
        body,
    )
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
        "jpVocabUsageSentenceIsConnectionFormula",
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

    # ～とき 用法2：义项说明含「た形＋とき」，禁止剥成只剩 (N3)
    toki2 = (
        "前句动词用现在形还是过去形，表达的时间关系不同："
        "动词「た形＋とき」表示前句动作完成之后；"
        "动词「る形＋とき」表示前句动作还未完成时。(N3)"
    )
    toki_got = strip_line(toki2)
    if toki_got.strip() in {"(N3)", "（N3）"} or len(toki_got) < 20:
        fail(f"～とき 用法2 不可剥光，得到: {toki_got!r}")
    if "た形＋とき" not in toki_got or "る形＋とき" not in toki_got:
        fail(f"～とき 用法2 应保留た/る对比义项: {toki_got!r}")

    # 纯公式句仍须剥掉
    formula = "动词た形＋とき。(N5)"
    if strip_line(formula) not in {"(N5)", ""}:
        # 句首「动词」+ た形＋ → 公式，应只剩等级
        got_f = strip_line(formula)
        if "动词た形" in got_f:
            fail(f"纯公式句应剥掉: {got_f!r}")

    # ～みたい 脏用法3：整句「接在…」→ 剥光只剩 (N4)
    mitai3 = "接在名词后作定语或用于句尾，表示「像……那样的」「类似……的」。(N4)"
    mitai_got = strip_line(mitai3)
    if mitai_got.strip() not in {"(N4)", "（N4）", ""}:
        fail(f"～みたい 接续伪用法应剥成等级空壳，得到: {mitai_got!r}")
    for needle in (
        "jpVocabUsagePointIsEmptyOrLevelOnly",
        "usage_empty_after_strip",
    ):
        if needle not in src:
            fail(f"jp-vocab-usage-ai.ts missing {needle!r}")

    rule = RULE.read_text(encoding="utf-8")
    if "usage_has_connection" not in rule:
        fail("jp-vocab-grammar-usage.mdc 须写明 usage_has_connection")
    if "usage_empty_after_strip" not in rule:
        fail("jp-vocab-grammar-usage.mdc 须写明 usage_empty_after_strip")
    if "误伤义项" not in rule and "た形＋とき" not in rule:
        fail("规则须写明剥接续勿误伤「た形＋とき」义项")

    print("OK: strip connection noise from usage")
    print(f"OK: dirty → {got}")
    print(f"OK: toki2 → {toki_got}")
    print(f"OK: mitai3 → {mitai_got!r}")
    print("All jp-vocab usage-no-connection-noise checks passed.")


if __name__ == "__main__":
    main()
