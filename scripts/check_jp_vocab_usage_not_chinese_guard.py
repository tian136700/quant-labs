#!/usr/bin/env python3
"""回归：语法 usage 禁止「」外 漢字(かな)；Mac 生成阶段须先拦。

对照 Worker jpVocabUsageLineLooksNonChinese → usage_not_chinese；
Mac online-batch grammar_usage_looks_chinese 缺则 incomplete_bundle:usage 重试。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
USAGE_FURIGANA_PAREN_RE = re.compile(r"\([\u3040-\u309Fー]+\)")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def looks_chinese(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return False
    no_quotes = re.sub(r"「[^」]*」", "", t)
    no_quotes = re.sub(r'"[^"]*"', "", no_quotes)
    if USAGE_FURIGANA_PAREN_RE.search(no_quotes):
        return False
    kana = re.findall(r"[\u3040-\u30FFー]", no_quotes)
    return len(kana) < 8


def main() -> int:
    batch = (ROOT / "scripts/jp-vocab-fill-online-batch-api.py").read_text(
        encoding="utf-8"
    )
    for needle in (
        "grammar_usage_looks_chinese",
        "USAGE_FURIGANA_PAREN_RE",
        "usage_not_chinese",
        "用(も)于",
    ):
        if needle not in batch:
            fail(f"online-batch missing {needle!r}")

    usage_ai = (ROOT / "src/lib/jp-vocab-usage-ai.ts").read_text(encoding="utf-8")
    if "jpVocabUsageLineLooksNonChinese" not in usage_ai:
        fail("usage-ai missing jpVocabUsageLineLooksNonChinese")
    if "usage_not_chinese" not in usage_ai:
        fail("usage-ai must reject usage_not_chinese")

    rule = (
        ROOT / ".cursor/rules/jp-vocab-content-quality-guard.mdc"
    ).read_text(encoding="utf-8")
    if "usage_not_chinese" not in rule or "用(も)" not in rule:
        fail("content-quality-guard 须记下 usage_not_chinese / 用(も)")

    bad = (
        "1. [口语8|考试7] 表示时间顺序。(N5)\n"
        "2. [口语7|考试6] 用(も)于列举，表示「除此之外还有」。(N5)"
    )
    good = (
        "1. [口语8|考试7] 表示时间顺序，相当于「然后、接下来」。(N5)\n"
        "2. [口语7|考试6] 用于列举补充，相当于「除此之外还有」。(N5)"
    )
    if looks_chinese(bad):
        fail("bad usage with 用(も)于 must NOT look Chinese")
    if not looks_chinese(good):
        fail("good Chinese usage must look Chinese")

    print("OK: jp-vocab usage_not_chinese / furigana-in-usage guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
