#!/usr/bin/env python3
"""Regression: 接序不得夹带用法说明（主语是谁／恩惠流向／可互换等）。

对照 src/lib/jp-vocab-connection-ai.ts 的 strip / reject connection_has_usage。
不调模型。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONN_AI = ROOT / "src/lib/jp-vocab-connection-ai.ts"
RULE_GRAMMAR = ROOT / ".cursor/rules/jp-vocab-grammar-usage.mdc"
RULE_QUALITY = ROOT / ".cursor/rules/jp-vocab-content-quality-guard.mdc"
NOTES = ROOT / "src/lib/jp-vocab-db/notes_fields.ts"

CONNECTION_USAGE_NOISE_RE = re.compile(
    r"恩惠(?:流向|从|得到)?|主语是|主语必须|接受方(?:是|为)|给予方(?:是|为)|"
    r"给予者是|受益者是|受益者（|意思相近|可互换|视角不同|从外向内|主动接收|"
    r"说话人一方|强调(?:对方|说话人|我方|该动作|付出|好意|获益|结果)|两句意思|"
    r"带有感谢|受恩的语气|含有感谢|必须是第三方"
)


def is_usage_noise(seg: str) -> bool:
    t = re.sub(r"[。．]+$", "", seg.strip())
    if not t:
        return False
    if CONNECTION_USAGE_NOISE_RE.search(t):
        return True
    if (
        not re.search(r"[＋+]", t)
        and not re.match(r"^(?:用法\s*\d+|否定形|肯定形|疑问形|注意)\s*[:：]", t)
        and not re.match(r"^(?:一类|二类|三类)(?:动词|形容词)", t)
        and len(t) >= 18
        and re.search(r"[\u4e00-\u9fff]{8,}", t)
        and re.search(r"(?:说话人|对方|我方|感谢|受惠|获益|好意|结果|受益者|给予者|第三方)", t)
    ):
        return True
    return False


def is_formula(seg: str) -> bool:
    t = seg.strip()
    if not t:
        return False
    if re.search(r"[＋+]", t):
        return True
    if re.match(r"^(?:用法\s*\d+|否定形|肯定形|疑问形|注意)\s*[:：]", t):
        return True
    if re.match(r"^(?:一类|二类|三类)(?:动词|形容词)", t):
        return True
    return False


def strip_usage_noise(raw: str) -> str:
    out: list[str] = []
    for line in raw.replace("\r\n", "\n").strip().split("\n"):
        trimmed = line.strip()
        if not trimmed:
            continue
        for chunk in re.split(r"[／/]", trimmed):
            parts: list[str] = []
            for seg in re.split(r"(?<=[。．])", chunk):
                s = re.sub(r"[。．]+$", "", seg.strip()).strip()
                if not s:
                    continue
                if is_usage_noise(s):
                    continue
                if is_formula(s):
                    parts.append(s)
            joined = "".join(parts)
            if joined and joined not in out:
                out.append(joined)
    return "\n".join(out)


def has_usage_noise(raw: str) -> bool:
    for line in raw.replace("\r\n", "\n").strip().split("\n"):
        for chunk in re.split(r"[／/]", line):
            for seg in re.split(r"(?<=[。．])", chunk):
                if is_usage_noise(seg):
                    return True
    return False


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    src = CONN_AI.read_text(encoding="utf-8")
    for needle in (
        "connectionHasUsageNoise",
        "stripJpVocabConnectionUsageNoise",
        "connection_has_usage",
        "接序禁止夹用法说明",
    ):
        if needle not in src:
            fail(f"jp-vocab-connection-ai.ts missing {needle!r}")

    notes = NOTES.read_text(encoding="utf-8")
    if "validateJpVocabConnectionAiOutput" not in notes:
        fail("notes_fields 编辑写回须校验接序")

    for rule_path in (RULE_GRAMMAR, RULE_QUALITY):
        text = rule_path.read_text(encoding="utf-8")
        if "connection_has_usage" not in text:
            fail(f"{rule_path.name} missing connection_has_usage")

    dirty = (
        "くれる：【动词て形】＋くれる。"
        "主语是给予方（第二、三人称），接受方是说话人或说话人一方，"
        "恩惠从外向内流向「我方」。／"
        "もらう：【动词て形】＋もらう。"
        "主语是说话人（我），给予方用助词「に」标记，说话人主动接收恩惠。"
        "两句意思相近，但くれる强调对方的行为与好意，もらう强调说话人获得的结果；"
        "对同一事件，两者可互换但视角不同。"
    )
    if not has_usage_noise(dirty):
        fail("くれる/もらう 脏接序应判 connection_has_usage")
    cleaned = strip_usage_noise(dirty)
    if "主语是" in cleaned or "恩惠" in cleaned or "意思相近" in cleaned:
        fail(f"strip 后仍含用法说明: {cleaned!r}")
    if "＋くれる" not in cleaned or "＋もらう" not in cleaned:
        fail(f"strip 后应保留形态公式: {cleaned!r}")

    # 失败预览 id=513：用法公式后「｜」列塞「主语必须…受益者是说话人一方」
    pipe_dirty = (
        "用法1: 给予者（他人）＋が／は＋受益者（我方）＋に＋名词＋をくれる"
        "｜主语必须是第三方，受益者是说话人或说话人一方\n"
        "用法2: 受益者（我方）＋は＋给予者＋に＋名词＋をもらう｜主语是我方"
    )
    if not has_usage_noise(pipe_dirty):
        fail("｜说明列夹「主语必须／受益者是」应判 connection_has_usage")

    # 合法短注解（前后主语可不同）不得误杀
    ok = "用法2: 动词原形＋と（前后主语可不同；后项客观描述）"
    if has_usage_noise(ok):
        fail("「前后主语可不同」短注解不应判噪音")
    if strip_usage_noise(ok) != ok:
        fail(f"合法接序被误剥: {strip_usage_noise(ok)!r}")

    # 授受对比合法短注不得误杀
    ok_give = (
        "用法1: 他人＋が＋我＋に＋名词＋をくれる｜给东西；动词て形＋くれる｜帮忙做事\n"
        "用法2: 我＋は＋他人＋に＋名词＋をもらう｜得到东西；动词て形＋もらう｜请人做事"
    )
    if has_usage_noise(ok_give):
        fail("授受对比合法短注接序不应判噪音")

    print("OK: jp-vocab connection no usage noise")


if __name__ == "__main__":
    main()
