#!/usr/bin/env python3
"""回归：语法例句 prompt 须要求场景自洽（有头有尾），禁止「来的话请进」类无厘头句。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    paths = [
        ROOT / "src/lib/jp-vocab-example-sentences-ai.ts",
        ROOT / "src/lib/jp-vocab-usage-ai.ts",
        ROOT / "src/lib/jp-vocab-fill-usage-single-examples.ts",
        ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py",
        ROOT / "scripts/jp-vocab-fill-online-batch-api.py",
        ROOT / ".cursor/rules/jp-vocab-example-sentences-compose.mdc",
    ]
    for p in paths:
        if not p.is_file():
            fail(f"missing {p.relative_to(ROOT)}")
        text = p.read_text(encoding="utf-8")
        if "场景自洽" not in text and "有头有尾" not in text:
            fail(f"{p.relative_to(ROOT)} 须含「场景自洽」或「有头有尾」")
        # 点名坏例，避免模型再造「来的话请进」
        if "来るなら" not in text and "来(く)るなら" not in text:
            fail(f"{p.relative_to(ROOT)} 须点名禁止「来るなら…」无厘头坏例")

    ai = (ROOT / "src/lib/jp-vocab-example-sentences-ai.ts").read_text(encoding="utf-8")
    if "version: 6" not in ai:
        fail("JP_VOCAB_EXAMPLE_SENTENCES_UPLOAD_SPEC 须为 version: 6")
    if "雨(あめ)なら、傘(かさ)を持(も)っていってください" not in ai:
        fail("example-sentences-ai 须给「雨なら、傘を…」正面样例")

    print("ok: jp-vocab example scene coherent prompts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
