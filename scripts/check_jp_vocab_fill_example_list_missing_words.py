#!/usr/bin/env python3
"""回归：单词 list_missing 例句不得因 connection 空 perpetual 进队（接序仅语法）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "lib" / "jp-vocab-fill-example-sentences.ts"


def main() -> int:
    text = SRC.read_text(encoding="utf-8")
    if "单词另含缺接序" in text:
        print("FAIL: obsolete comment about word connection still present", file=sys.stderr)
        return 1
    # 单词分支 SQL 不得再 OR connection 空
    bad = "kind = 'word'" in text and "connection IS NULL OR TRIM(connection)" in text
    if bad:
        # 允许 grammar / 全量 count 里单独处理 connection；单词 WHERE 块不能 OR connection
        blocks = text.split("kind = 'word'")
        for block in blocks[1:]:
            chunk = block.split("kind = 'grammar'")[0][:800]
            if "connection IS NULL" in chunk and "example_sentences" in chunk:
                if "OR (connection IS NULL" in chunk or "OR (connection IS NULL".replace(
                    " ", ""
                ):
                    print(
                        "FAIL: word list_missing still ORs empty connection",
                        file=sys.stderr,
                    )
                    return 1
    if "接序仅语法" not in text:
        print("FAIL: missing guard comment", file=sys.stderr)
        return 1
    print("[check_jp_vocab_fill_example_list_missing_words] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
