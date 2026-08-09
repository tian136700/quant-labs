#!/usr/bin/env python3
"""回归：语法用法禁止「多方面因素共同导致」等过强因果套话（～し 等列举类）。

对照 Worker jpVocabUsageHasOverstrongCausalClaim → usage_overstrong_causal；
prompt / UPLOAD_SPEC / Mac PAIR_SYSTEM / content-quality-guard 须接线。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

OVERSTRONG_RE = re.compile(
    r"多方面因素.{0,16}(共同)?导致|多方面原因.{0,12}导致|"
    r"由.{0,20}因素.{0,12}(共同)?导致|共同导致"
)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    helper = (
        ROOT / "src/lib/jp-vocab-usage-overstrong-causal.ts"
    ).read_text(encoding="utf-8")
    for needle in (
        "JP_VOCAB_USAGE_OVERSTRONG_CAUSAL_RE",
        "jpVocabUsageHasOverstrongCausalClaim",
        "共同导致",
    ):
        if needle not in helper:
            fail(f"overstrong-causal helper missing {needle!r}")

    usage_ai = (ROOT / "src/lib/jp-vocab-usage-ai.ts").read_text(encoding="utf-8")
    for needle in (
        "jpVocabUsageHasOverstrongCausalClaim",
        "usage_overstrong_causal",
        "多方面因素共同导致",
        "version: 11",
    ):
        if needle not in usage_ai:
            fail(f"usage-ai missing {needle!r}")

    mac = (
        ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py"
    ).read_text(encoding="utf-8")
    if "多方面因素共同导致" not in mac or "共同导致" not in mac:
        fail("Mac PAIR_SYSTEM 须禁止「多方面因素共同导致」")

    rule = (
        ROOT / ".cursor/rules/jp-vocab-content-quality-guard.mdc"
    ).read_text(encoding="utf-8")
    if "usage_overstrong_causal" not in rule or "共同导致" not in rule:
        fail("content-quality-guard 须记下 usage_overstrong_causal / 共同导致")

    bad = (
        '列举多个原因或理由，表示"又……又……""而且……"，'
        "暗示后面结论或决定是由多方面因素共同导致的。(N4)"
    )
    good = (
        "列举两个以上的理由或情况，表示「又……又……」「而且……」；"
        "后文常接说话人的感想、结论或决定。(N4)"
    )
    if not OVERSTRONG_RE.search(bad):
        fail("bad ～し usage must match overstrong causal RE")
    if OVERSTRONG_RE.search(good):
        fail("good ～し usage must NOT match overstrong causal RE")

    print("OK: jp-vocab usage_overstrong_causal guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
